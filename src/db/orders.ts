import { getDb } from "./client";
import type { Order, OrderItem, OrderStatus, OrderType } from "@/domain/types";

export type OrderListRow = Order & {
  partner_name: string | null; // tên KH hoặc NCC
  item_count: number;
};

export type PurchaseInput = {
  supplier_id: number | null;
  note?: string | null;
  paid: number; // số đã trả NCC
  items: PurchaseLine[];
};

export type PurchaseLine = {
  variant_id: number;
  product_name: string; // chỉ để hiển thị
  qty: number;
  price: number; // giá nhập
};

export type SaleInput = {
  customer_id: number | null;
  note?: string | null;
  paid: number; // số tiền KH đã thanh toán
  items: SaleLine[];
};

export type SaleLine = {
  variant_id: number;
  product_name: string;
  qty: number;
  price: number; // giá bán
};

/**
 * Sinh code cho đơn: PN-YYYYMMDD-NNN (purchase), HD-... (sale), TR-... (return)
 */
async function generateOrderCode(type: OrderType): Promise<string> {
  const db = await getDb();
  const prefix = type === "purchase" ? "PN" : type === "sale" ? "HD" : "TR";
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const like = `${prefix}-${dateStr}-%`;
  const rows = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM orders WHERE code LIKE ?",
    [like],
  );
  const next = (rows[0]?.c ?? 0) + 1;
  return `${prefix}-${dateStr}-${String(next).padStart(3, "0")}`;
}

/**
 * Tạo phiếu nhập kho từ NCC.
 *
 * Không có transaction thật (Tauri SQL plugin chưa hỗ trợ qua JS API).
 * Vì app single-user single-machine, rủi ro inconsistency thấp.
 * Sau này có thể thêm command Rust để wrap trong sqlx::Transaction nếu cần.
 */
export async function createPurchase(input: PurchaseInput): Promise<number> {
  if (input.items.length === 0) {
    throw new Error("Phiếu nhập phải có ít nhất 1 dòng sản phẩm");
  }

  const db = await getDb();
  const subtotal = input.items.reduce((s, l) => s + l.qty * l.price, 0);
  const total = subtotal; // chưa có discount cho phiếu nhập
  const paid = Math.min(input.paid, total);
  const code = await generateOrderCode("purchase");
  const status: OrderStatus = paid >= total ? "paid" : "delivered";

  // 1. Tạo order
  const orderResult = await db.execute(
    `INSERT INTO orders
       (code, type, supplier_id, subtotal, discount, total, paid, status, note)
     VALUES (?, 'purchase', ?, ?, 0, ?, ?, ?, ?)`,
    [code, input.supplier_id, subtotal, total, paid, status, input.note ?? null],
  );
  const orderId = Number(orderResult.lastInsertId);

  // 2. Items + stock movements + cập nhật stock cache
  for (const line of input.items) {
    const lineTotal = line.qty * line.price;
    await db.execute(
      `INSERT INTO order_items (order_id, variant_id, qty, price, cost, discount, total)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [orderId, line.variant_id, line.qty, line.price, line.price, lineTotal],
    );
    await db.execute(
      `INSERT INTO stock_movements (variant_id, qty_change, type, ref_table, ref_id, note)
       VALUES (?, ?, 'purchase', 'orders', ?, ?)`,
      [line.variant_id, line.qty, orderId, `Nhập từ phiếu ${code}`],
    );
    await db.execute(
      `UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?`,
      [line.qty, line.variant_id],
    );
    // Cập nhật giá vốn mới nhất cho product (để tính lãi đơn bán sau này)
    await db.execute(
      `UPDATE products SET price_cost = ?, updated_at = datetime('now')
       WHERE id = (SELECT product_id FROM product_variants WHERE id = ?)`,
      [line.price, line.variant_id],
    );
  }

  // 3. Sổ quỹ: ghi chi nếu có trả tiền
  if (paid > 0) {
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note)
       VALUES ('out', ?, 'Trả NCC', 'orders', ?, ?)`,
      [paid, orderId, `Trả tiền phiếu ${code}`],
    );
  }

  // 4. Cập nhật công nợ NCC (phần chưa trả)
  if (input.supplier_id && paid < total) {
    await db.execute(
      `UPDATE suppliers SET debt_amount = debt_amount + ? WHERE id = ?`,
      [total - paid, input.supplier_id],
    );
  }

  return orderId;
}

/**
 * Tạo phiếu bán cho khách hàng.
 * Trừ tồn + ghi sổ quỹ (thu) + cộng công nợ KH (nếu chưa trả đủ).
 *
 * Có cho phép bán âm tồn (oversell) nhưng cảnh báo phía UI.
 */
export async function createSale(input: SaleInput): Promise<number> {
  if (input.items.length === 0) {
    throw new Error("Phiếu bán phải có ít nhất 1 dòng sản phẩm");
  }

  const db = await getDb();
  const subtotal = input.items.reduce((s, l) => s + l.qty * l.price, 0);
  const total = subtotal;
  const paid = Math.min(input.paid, total);
  const code = await generateOrderCode("sale");
  const status: OrderStatus = paid >= total ? "paid" : "delivered";

  // Lấy giá vốn hiện tại cho từng variant (snapshot vào order_items để tính lãi sau này)
  const variantIds = input.items.map((l) => l.variant_id);
  const placeholders = variantIds.map(() => "?").join(",");
  const variantCosts = await db.select<{ id: number; price_cost: number }[]>(
    `SELECT v.id, COALESCE(v.price_cost, p.price_cost) AS price_cost
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE v.id IN (${placeholders})`,
    variantIds,
  );
  const costMap = new Map(variantCosts.map((r) => [r.id, r.price_cost]));

  // 1. Tạo order
  const orderResult = await db.execute(
    `INSERT INTO orders
       (code, type, customer_id, subtotal, discount, total, paid, status, note)
     VALUES (?, 'sale', ?, ?, 0, ?, ?, ?, ?)`,
    [code, input.customer_id, subtotal, total, paid, status, input.note ?? null],
  );
  const orderId = Number(orderResult.lastInsertId);

  // 2. Items + stock movements (-) + cập nhật stock cache
  for (const line of input.items) {
    const lineTotal = line.qty * line.price;
    const cost = costMap.get(line.variant_id) ?? 0;
    await db.execute(
      `INSERT INTO order_items (order_id, variant_id, qty, price, cost, discount, total)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [orderId, line.variant_id, line.qty, line.price, cost, lineTotal],
    );
    await db.execute(
      `INSERT INTO stock_movements (variant_id, qty_change, type, ref_table, ref_id, note)
       VALUES (?, ?, 'sale', 'orders', ?, ?)`,
      [line.variant_id, -line.qty, orderId, `Bán theo phiếu ${code}`],
    );
    await db.execute(
      `UPDATE product_variants SET stock_qty = stock_qty - ? WHERE id = ?`,
      [line.qty, line.variant_id],
    );
  }

  // 3. Sổ quỹ: ghi thu nếu có nhận tiền
  if (paid > 0) {
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note)
       VALUES ('in', ?, 'Thu bán hàng', 'orders', ?, ?)`,
      [paid, orderId, `Thu tiền phiếu ${code}`],
    );
  }

  // 4. Công nợ KH (phần chưa thu)
  if (input.customer_id && paid < total) {
    await db.execute(
      `UPDATE customers SET debt_amount = debt_amount + ? WHERE id = ?`,
      [total - paid, input.customer_id],
    );
  }

  return orderId;
}

/** Danh sách orders với tên đối tác và số dòng */
export async function listOrders(
  type: OrderType | "all" = "all",
  limit = 200,
): Promise<OrderListRow[]> {
  const db = await getDb();
  const where = type === "all" ? "" : "WHERE o.type = ?";
  const params = type === "all" ? [limit] : [type, limit];
  const sql = `
    SELECT
      o.*,
      COALESCE(c.name, s.name) AS partner_name,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN suppliers s ON s.id = o.supplier_id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ?
  `;
  return await db.select<OrderListRow[]>(sql, params);
}

export type OrderDetail = OrderListRow;

export async function getOrderById(id: number): Promise<OrderDetail | null> {
  const db = await getDb();
  const rows = await db.select<OrderDetail[]>(
    `SELECT
       o.*,
       COALESCE(c.name, s.name) AS partner_name,
       (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE o.id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Hủy đơn: đảo ngược tồn kho, sổ quỹ, công nợ. Ghi nhận bằng các bản ghi
 * mới (compensating entries) - KHÔNG xóa data cũ để giữ audit trail.
 */
export async function cancelOrder(id: number): Promise<void> {
  const db = await getDb();
  const order = await getOrderById(id);
  if (!order) throw new Error("Không tìm thấy đơn");
  if (order.status === "cancelled") throw new Error("Đơn đã bị hủy trước đó");

  const items = await db.select<OrderItem[]>(
    "SELECT * FROM order_items WHERE order_id = ?",
    [id],
  );

  // 1. Đảo tồn kho
  for (const it of items) {
    const reverseQty = order.type === "sale" ? it.qty : -it.qty;
    await db.execute(
      `INSERT INTO stock_movements (variant_id, qty_change, type, ref_table, ref_id, note)
       VALUES (?, ?, 'adjust', 'orders', ?, ?)`,
      [it.variant_id, reverseQty, id, `Hủy phiếu ${order.code}`],
    );
    await db.execute(
      `UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?`,
      [reverseQty, it.variant_id],
    );
  }

  // 2. Đảo sổ quỹ: nếu order tự tạo cash_transactions thì sinh bản đối ứng
  if (order.paid > 0) {
    const reverseCashType = order.type === "sale" ? "out" : "in";
    const category = order.type === "sale" ? "Hoàn tiền KH" : "NCC hoàn tiền";
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note)
       VALUES (?, ?, ?, 'orders', ?, ?)`,
      [reverseCashType, order.paid, category, id, `Hủy phiếu ${order.code}`],
    );
  }

  // 3. Đảo công nợ
  const debtAmount = order.total - order.paid;
  if (debtAmount > 0) {
    if (order.type === "sale" && order.customer_id) {
      await db.execute(
        `UPDATE customers SET debt_amount = debt_amount - ? WHERE id = ?`,
        [debtAmount, order.customer_id],
      );
    } else if (order.type === "purchase" && order.supplier_id) {
      await db.execute(
        `UPDATE suppliers SET debt_amount = debt_amount - ? WHERE id = ?`,
        [debtAmount, order.supplier_id],
      );
    }
  }

  // 4. Đánh dấu đơn cancelled
  await db.execute(
    `UPDATE orders SET status = 'cancelled' WHERE id = ?`,
    [id],
  );
}

export async function getOrderItems(orderId: number): Promise<
  Array<OrderItem & { sku: string; product_name: string }>
> {
  const db = await getDb();
  return await db.select(
    `SELECT
       i.*,
       v.sku    AS sku,
       p.name   AS product_name
     FROM order_items i
     JOIN product_variants v ON v.id = i.variant_id
     JOIN products p         ON p.id = v.product_id
     WHERE i.order_id = ?
     ORDER BY i.id`,
    [orderId],
  );
}
