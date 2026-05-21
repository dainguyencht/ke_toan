import { getDb } from "./client";
import type {
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  ProductUnit,
} from "@/domain/types";
import { dbDateTime } from "@/lib/utils";
import { listUnitsOfProduct } from "./units";

export type OrderListRow = Order & {
  partner_name: string | null; // tên KH hoặc NCC
  item_count: number;
};

export type PurchaseInput = {
  supplier_id: number | null;
  note?: string | null;
  paid: number; // số đã trả NCC
  items: PurchaseLine[];
  /** Ngày giờ phiếu dạng 'YYYY-MM-DD HH:MM:SS'. Bỏ trống = thời điểm hiện tại. */
  created_at?: string;
};

export type PurchaseLine = {
  variant_id: number;
  product_name: string; // chỉ để hiển thị
  qty: number;          // theo unit_name
  price: number;        // giá nhập theo unit_name
  unit_name: string;    // snapshot
  unit_factor: number;  // 1 unit_name = factor × base_unit
};

export type SaleInput = {
  customer_id: number | null;
  note?: string | null;
  paid: number; // số tiền KH đã thanh toán
  items: SaleLine[];
  /** Ngày giờ phiếu dạng 'YYYY-MM-DD HH:MM:SS'. Bỏ trống = thời điểm hiện tại. */
  created_at?: string;
};

export type SaleLine = {
  variant_id: number;
  product_name: string;
  qty: number;          // theo unit_name
  price: number;        // giá bán theo unit_name
  unit_name: string;
  unit_factor: number;
};

/**
 * Sinh code cho đơn: PN-YYYYMMDD-NNN (purchase), HD-... (sale), TR-... (return).
 * `dateStr` (YYYYMMDD) lấy theo ngày của phiếu — bỏ trống thì dùng hôm nay.
 */
async function generateOrderCode(
  type: OrderType,
  dateStr?: string,
): Promise<string> {
  const db = await getDb();
  const prefix = type === "purchase" ? "PN" : type === "sale" ? "HD" : "TR";
  if (!dateStr) {
    const today = new Date();
    dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
  }
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
  const createdAt = input.created_at ?? dbDateTime();
  const code = await generateOrderCode(
    "purchase",
    createdAt.slice(0, 10).replace(/-/g, ""),
  );
  const status: OrderStatus = paid >= total ? "paid" : "delivered";

  // 1. Tạo order
  const orderResult = await db.execute(
    `INSERT INTO orders
       (code, type, supplier_id, subtotal, discount, total, paid, status, note, created_at)
     VALUES (?, 'purchase', ?, ?, 0, ?, ?, ?, ?, ?)`,
    [
      code,
      input.supplier_id,
      subtotal,
      total,
      paid,
      status,
      input.note ?? null,
      createdAt,
    ],
  );
  const orderId = Number(orderResult.lastInsertId);

  // 2. Items + stock movements + cập nhật stock cache (quy đổi về base unit)
  for (const line of input.items) {
    const lineTotal = line.qty * line.price;
    const qtyBase = line.qty * line.unit_factor;
    await db.execute(
      `INSERT INTO order_items
        (order_id, variant_id, qty, price, cost, discount, total, unit_name, unit_factor)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        orderId,
        line.variant_id,
        line.qty,
        line.price,
        line.price,
        lineTotal,
        line.unit_name,
        line.unit_factor,
      ],
    );
    await db.execute(
      `INSERT INTO stock_movements (variant_id, qty_change, type, ref_table, ref_id, note, created_at)
       VALUES (?, ?, 'purchase', 'orders', ?, ?, ?)`,
      [
        line.variant_id,
        qtyBase,
        orderId,
        `Nhập từ phiếu ${code} (${line.qty} ${line.unit_name})`,
        createdAt,
      ],
    );
    await db.execute(
      `UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?`,
      [qtyBase, line.variant_id],
    );
    // Cập nhật giá vốn cho product theo giá nhập của 1 base unit
    const costPerBase = line.unit_factor > 0 ? line.price / line.unit_factor : line.price;
    await db.execute(
      `UPDATE products SET price_cost = ?, updated_at = datetime('now')
       WHERE id = (SELECT product_id FROM product_variants WHERE id = ?)`,
      [costPerBase, line.variant_id],
    );
  }

  // 3. Sổ quỹ: ghi chi nếu có trả tiền
  if (paid > 0) {
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note, created_at)
       VALUES ('out', ?, 'Trả NCC', 'orders', ?, ?, ?)`,
      [paid, orderId, `Trả tiền phiếu ${code}`, createdAt],
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
  const createdAt = input.created_at ?? dbDateTime();
  const code = await generateOrderCode(
    "sale",
    createdAt.slice(0, 10).replace(/-/g, ""),
  );
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
       (code, type, customer_id, subtotal, discount, total, paid, status, note, created_at)
     VALUES (?, 'sale', ?, ?, 0, ?, ?, ?, ?, ?)`,
    [
      code,
      input.customer_id,
      subtotal,
      total,
      paid,
      status,
      input.note ?? null,
      createdAt,
    ],
  );
  const orderId = Number(orderResult.lastInsertId);

  // 2. Items + stock movements (-) + cập nhật stock cache (quy đổi về base unit)
  for (const line of input.items) {
    const lineTotal = line.qty * line.price;
    const qtyBase = line.qty * line.unit_factor;
    // Giá vốn ở đây snapshot theo base, nhân với factor để khớp với qty bán
    const baseCost = costMap.get(line.variant_id) ?? 0;
    const cost = baseCost * line.unit_factor; // giá vốn cho 1 đơn vị bán
    await db.execute(
      `INSERT INTO order_items
        (order_id, variant_id, qty, price, cost, discount, total, unit_name, unit_factor)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        orderId,
        line.variant_id,
        line.qty,
        line.price,
        cost,
        lineTotal,
        line.unit_name,
        line.unit_factor,
      ],
    );
    await db.execute(
      `INSERT INTO stock_movements (variant_id, qty_change, type, ref_table, ref_id, note, created_at)
       VALUES (?, ?, 'sale', 'orders', ?, ?, ?)`,
      [
        line.variant_id,
        -qtyBase,
        orderId,
        `Bán theo phiếu ${code} (${line.qty} ${line.unit_name})`,
        createdAt,
      ],
    );
    await db.execute(
      `UPDATE product_variants SET stock_qty = stock_qty - ? WHERE id = ?`,
      [qtyBase, line.variant_id],
    );
  }

  // 3. Sổ quỹ: ghi thu nếu có nhận tiền
  if (paid > 0) {
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note, created_at)
       VALUES ('in', ?, 'Thu bán hàng', 'orders', ?, ?, ?)`,
      [paid, orderId, `Thu tiền phiếu ${code}`, createdAt],
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

/**
 * Thu/trả thêm tiền cho 1 đơn hàng cụ thể.
 * - Cập nhật order.paid, status (→ 'paid' nếu trả đủ)
 * - Insert cash_transactions (in cho sale, out cho purchase) gắn vào đơn
 * - Giảm debt_amount của KH/NCC tương ứng
 */
export async function payOrderDebt(
  orderId: number,
  amount: number,
  note?: string | null,
): Promise<void> {
  if (amount <= 0) throw new Error("Số tiền phải > 0");

  const db = await getDb();
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn");
  if (order.status === "cancelled") throw new Error("Đơn đã bị hủy");
  if (order.type === "return") {
    throw new Error("Không áp dụng cho đơn trả hàng");
  }

  const remaining = order.total - order.paid;
  if (remaining <= 0) throw new Error("Đơn đã thanh toán đủ");
  if (amount > remaining) {
    throw new Error(`Số tiền (${amount}) lớn hơn còn nợ (${remaining})`);
  }

  const newPaid = order.paid + amount;
  const newStatus: OrderStatus = newPaid >= order.total ? "paid" : order.status;
  const verb = order.type === "sale" ? "Thu nợ" : "Trả nợ";

  // 1. Cập nhật order
  await db.execute(
    `UPDATE orders SET paid = ?, status = ? WHERE id = ?`,
    [newPaid, newStatus, orderId],
  );

  // 2. Sổ quỹ
  const cashType: "in" | "out" = order.type === "sale" ? "in" : "out";
  const category = `${verb} đơn hàng`;
  const finalNote = note?.trim() || `${verb} ${order.code}`;
  await db.execute(
    `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note)
     VALUES (?, ?, ?, 'orders', ?, ?)`,
    [cashType, amount, category, orderId, finalNote],
  );

  // 3. Giảm công nợ contact
  if (order.type === "sale" && order.customer_id) {
    await db.execute(
      `UPDATE customers SET debt_amount = debt_amount - ? WHERE id = ?`,
      [amount, order.customer_id],
    );
  } else if (order.type === "purchase" && order.supplier_id) {
    await db.execute(
      `UPDATE suppliers SET debt_amount = debt_amount - ? WHERE id = ?`,
      [amount, order.supplier_id],
    );
  }
}

/** Danh sách orders với tên đối tác và số dòng */
export async function listOrders(
  type: OrderType | "all" = "all",
  limit = 200,
): Promise<OrderListRow[]> {
  const db = await getDb();
  const conds = ["o.status != 'cancelled'"];
  const params: unknown[] = [];
  if (type !== "all") {
    conds.push("o.type = ?");
    params.push(type);
  }
  params.push(limit);
  const sql = `
    SELECT
      o.*,
      COALESCE(c.name, s.name) AS partner_name,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN suppliers s ON s.id = o.supplier_id
    WHERE ${conds.join(" AND ")}
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

  // 1. Đảo tồn kho (đổi qty về base unit qua unit_factor)
  for (const it of items) {
    const qtyBase = it.qty * (it.unit_factor || 1);
    const reverseQty = order.type === "sale" ? qtyBase : -qtyBase;
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

/**
 * Dữ liệu cần để pre-fill form khi edit phiếu.
 * Cho mỗi item: thông tin SP + tồn hiện tại + danh sách unit + unit_id khớp snapshot.
 */
export type OrderEditLine = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  base_unit: string;
  base_price_cost: number;
  base_price_sell: number;
  stock_base: number; // tồn hiện tại theo base
  units: ProductUnit[];
  unit_id: number; // matched từ snapshot unit_name (fallback base)
  qty: number;
  price: number;
};

export async function loadOrderForEdit(
  orderId: number,
): Promise<{ order: OrderListRow; lines: OrderEditLine[] }> {
  const order = await getOrderById(orderId);
  if (!order) throw new Error("Không tìm thấy đơn");

  const items = await getOrderItems(orderId);
  const db = await getDb();

  const lines: OrderEditLine[] = await Promise.all(
    items.map(async (it) => {
      const rows = await db.select<
        {
          product_id: number;
          product_name: string;
          sku: string;
          base_unit: string;
          base_price_cost: number;
          base_price_sell: number;
          stock_base: number;
        }[]
      >(
        `SELECT
           p.id          AS product_id,
           p.name        AS product_name,
           v.sku         AS sku,
           p.unit        AS base_unit,
           p.price_cost  AS base_price_cost,
           p.price_sell  AS base_price_sell,
           v.stock_qty   AS stock_base
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = ?`,
        [it.variant_id],
      );
      const info = rows[0];
      const units = await listUnitsOfProduct(info.product_id);
      // Khớp unit theo name (snapshot). Fallback: base unit.
      const matched =
        units.find((u) => u.name === it.unit_name) ??
        units.find((u) => u.is_base) ??
        units[0];

      return {
        variant_id: it.variant_id,
        product_id: info.product_id,
        product_name: info.product_name,
        sku: info.sku,
        base_unit: info.base_unit,
        base_price_cost: info.base_price_cost,
        base_price_sell: info.base_price_sell,
        stock_base: info.stock_base,
        units,
        unit_id: matched?.id ?? 0,
        qty: it.qty,
        price: it.price,
      };
    }),
  );

  return { order, lines };
}

export async function getOrderItems(orderId: number): Promise<
  Array<OrderItem & { sku: string; product_name: string; base_unit: string }>
> {
  const db = await getDb();
  return await db.select(
    `SELECT
       i.*,
       v.sku    AS sku,
       p.name   AS product_name,
       p.unit   AS base_unit
     FROM order_items i
     JOIN product_variants v ON v.id = i.variant_id
     JOIN products p         ON p.id = v.product_id
     WHERE i.order_id = ?
     ORDER BY i.id`,
    [orderId],
  );
}
