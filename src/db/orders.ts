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
 * Recompute contact.debt_amount = tổng giá trị visible timeline (orders không
 * cancelled + cash linked). Gọi sau mọi mutation create/cancel để debt luôn
 * khớp với timeline — chống data lệch do edge case (overpay cancel...).
 */
export async function recomputeAndSetContactDebt(
  kind: "customer" | "supplier",
  contactId: number,
): Promise<void> {
  const db = await getDb();
  const table = kind === "customer" ? "customers" : "suppliers";
  const col = kind === "customer" ? "customer_id" : "supplier_id";

  const orderRows = await db.select<{ type: OrderType; total: number }[]>(
    `SELECT type, total FROM orders
     WHERE ${col} = ? AND status != 'cancelled'`,
    [contactId],
  );
  const cashRows = await db.select<{ type: "in" | "out"; amount: number }[]>(
    `SELECT type, amount FROM cash_transactions
     WHERE (ref_table = ? AND ref_id = ?)
        OR (ref_table = 'orders' AND ref_id IN (
              SELECT id FROM orders WHERE ${col} = ? AND status != 'cancelled'
            ))`,
    [table, contactId, contactId],
  );

  let debt = 0;
  for (const o of orderRows) {
    debt += o.type === "return" ? -o.total : o.total;
  }
  for (const c of cashRows) {
    const reducesDebt =
      (kind === "customer" && c.type === "in") ||
      (kind === "supplier" && c.type === "out");
    debt += reducesDebt ? -c.amount : c.amount;
  }
  await db.execute(`UPDATE ${table} SET debt_amount = ? WHERE id = ?`, [
    debt,
    contactId,
  ]);
}

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
  // Cho phép trả > total nếu có NCC (phần dư trừ vào nợ cũ NCC).
  // Không có NCC thì cap tại total để tránh tiền treo.
  const cashOut = input.supplier_id ? input.paid : Math.min(input.paid, total);
  const paid = Math.min(cashOut, total); // order.paid không vượt total
  const createdAt = input.created_at ?? dbDateTime();
  const code = await generateOrderCode(
    "purchase",
    createdAt.slice(0, 10).replace(/-/g, ""),
  );
  const status: OrderStatus = paid >= total ? "paid" : "delivered";

  // Snapshot công nợ NCC trước khi tạo phiếu (cho "Nợ cũ" trên hoá đơn)
  let snapshotDebt = 0;
  if (input.supplier_id) {
    const debtRows = await db.select<{ debt_amount: number }[]>(
      "SELECT debt_amount FROM suppliers WHERE id = ?",
      [input.supplier_id],
    );
    snapshotDebt = debtRows[0]?.debt_amount ?? 0;
  }

  // 1. Tạo order
  const orderResult = await db.execute(
    `INSERT INTO orders
       (code, type, supplier_id, subtotal, discount, total, paid, status, note, created_at, snapshot_debt)
     VALUES (?, 'purchase', ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.supplier_id,
      subtotal,
      total,
      paid,
      status,
      input.note ?? null,
      createdAt,
      snapshotDebt,
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

  // 3. Sổ quỹ: ghi chi cho số tiền thực đã trả (có thể > total nếu trả dư trừ nợ cũ)
  if (cashOut > 0) {
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note, created_at)
       VALUES ('out', ?, 'Trả NCC', 'orders', ?, ?, ?)`,
      [cashOut, orderId, `Trả tiền phiếu ${code}`, createdAt],
    );
  }

  // 4. Cập nhật công nợ NCC: debt += (total - cashOut)
  //    - cashOut < total: nợ tăng (mình còn nợ NCC)
  //    - cashOut > total: nợ giảm (trừ nợ cũ; có thể âm = NCC còn nợ mình)
  if (input.supplier_id && cashOut !== total) {
    await db.execute(
      `UPDATE suppliers SET debt_amount = debt_amount + ? WHERE id = ?`,
      [total - cashOut, input.supplier_id],
    );
  }

  // 5. Recompute đảm bảo debt khớp tổng timeline
  if (input.supplier_id) await recomputeAndSetContactDebt("supplier", input.supplier_id);

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
  // Cho phép thu > total nếu có KH (phần dư trừ vào nợ cũ KH).
  // Không có KH thì cap tại total để tránh tiền treo.
  const cashIn = input.customer_id ? input.paid : Math.min(input.paid, total);
  const paid = Math.min(cashIn, total); // order.paid không vượt total
  const createdAt = input.created_at ?? dbDateTime();
  const code = await generateOrderCode(
    "sale",
    createdAt.slice(0, 10).replace(/-/g, ""),
  );
  const status: OrderStatus = paid >= total ? "paid" : "delivered";

  // Snapshot công nợ KH trước khi tạo phiếu (cho "Nợ cũ" trên hoá đơn)
  let snapshotDebt = 0;
  if (input.customer_id) {
    const debtRows = await db.select<{ debt_amount: number }[]>(
      "SELECT debt_amount FROM customers WHERE id = ?",
      [input.customer_id],
    );
    snapshotDebt = debtRows[0]?.debt_amount ?? 0;
  }

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
       (code, type, customer_id, subtotal, discount, total, paid, status, note, created_at, snapshot_debt)
     VALUES (?, 'sale', ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      input.customer_id,
      subtotal,
      total,
      paid,
      status,
      input.note ?? null,
      createdAt,
      snapshotDebt,
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

  // 3. Sổ quỹ: ghi thu cho số tiền thực đã nhận (có thể > total nếu thu dư trừ nợ cũ)
  if (cashIn > 0) {
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note, created_at)
       VALUES ('in', ?, 'Thu bán hàng', 'orders', ?, ?, ?)`,
      [cashIn, orderId, `Thu tiền phiếu ${code}`, createdAt],
    );
  }

  // 4. Công nợ KH: debt += (total - cashIn)
  //    - cashIn < total: nợ tăng (KH còn nợ)
  //    - cashIn > total: nợ giảm (trừ nợ cũ; có thể âm = KH dư tiền)
  if (input.customer_id && cashIn !== total) {
    await db.execute(
      `UPDATE customers SET debt_amount = debt_amount + ? WHERE id = ?`,
      [total - cashIn, input.customer_id],
    );
  }

  // 5. Recompute đảm bảo debt khớp tổng timeline
  if (input.customer_id) await recomputeAndSetContactDebt("customer", input.customer_id);

  return orderId;
}

export type ReturnLine = {
  variant_id: number;
  product_name: string;
  qty: number;
  price: number;
  unit_name: string;
  unit_factor: number;
};

export type ReturnInput = {
  /** "customer": KH trả lại cho mình; "supplier": mình trả lại NCC */
  kind: "customer" | "supplier";
  contact_id: number;
  /** Đơn gốc (tùy chọn) — nếu có sẽ ghi vào note để audit */
  source_order_id?: number | null;
  note?: string | null;
  /** Số tiền đã hoàn (kind=customer) / đã nhận lại (kind=supplier) */
  paid: number;
  items: ReturnLine[];
  created_at?: string;
};

/**
 * Tạo phiếu trả hàng (type='return').
 *
 * kind='customer' (KH trả lại):
 *   - Tồn kho TĂNG (+qty)
 *   - Cash OUT (hoàn tiền KH) cho phần `paid`
 *   - Nếu paid < total → KH nợ ngược (customers.debt_amount giảm — có thể âm)
 *
 * kind='supplier' (mình trả NCC):
 *   - Tồn kho GIẢM (-qty)
 *   - Cash IN (NCC hoàn tiền) cho phần `paid`
 *   - Nếu paid < total → NCC nợ mình (suppliers.debt_amount giảm — có thể âm)
 */
export async function createReturn(input: ReturnInput): Promise<number> {
  if (input.items.length === 0) {
    throw new Error("Phiếu trả phải có ít nhất 1 dòng sản phẩm");
  }
  const db = await getDb();
  const subtotal = input.items.reduce((s, l) => s + l.qty * l.price, 0);
  const total = subtotal;
  const paid = Math.min(input.paid, total);
  const createdAt = input.created_at ?? dbDateTime();
  const code = await generateOrderCode(
    "return",
    createdAt.slice(0, 10).replace(/-/g, ""),
  );
  const status: OrderStatus = paid >= total ? "paid" : "delivered";
  const isFromCustomer = input.kind === "customer";

  // Compose note với link đơn gốc nếu có
  let finalNote = input.note?.trim() || null;
  if (input.source_order_id) {
    const src = await db.select<{ code: string }[]>(
      "SELECT code FROM orders WHERE id = ?",
      [input.source_order_id],
    );
    if (src.length) {
      const linkText = `Liên kết: ${src[0].code}`;
      finalNote = finalNote ? `${linkText}\n${finalNote}` : linkText;
    }
  }

  // Snapshot công nợ TRƯỚC khi tạo phiếu trả
  const snapshotTable = isFromCustomer ? "customers" : "suppliers";
  const debtRows = await db.select<{ debt_amount: number }[]>(
    `SELECT debt_amount FROM ${snapshotTable} WHERE id = ?`,
    [input.contact_id],
  );
  const snapshotDebt = debtRows[0]?.debt_amount ?? 0;

  // 1. Tạo order
  const orderResult = await db.execute(
    `INSERT INTO orders
       (code, type, customer_id, supplier_id, subtotal, discount, total, paid, status, note, created_at, snapshot_debt)
     VALUES (?, 'return', ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
    [
      code,
      isFromCustomer ? input.contact_id : null,
      isFromCustomer ? null : input.contact_id,
      subtotal,
      total,
      paid,
      status,
      finalNote,
      createdAt,
      snapshotDebt,
    ],
  );
  const orderId = Number(orderResult.lastInsertId);

  // 2. Items + stock movements (sign theo loại) + snapshot cost
  const sign = isFromCustomer ? 1 : -1;
  const variantIds = input.items.map((l) => l.variant_id);
  const placeholders = variantIds.map(() => "?").join(",");
  const variantCosts = await db.select<{ id: number; price_cost: number }[]>(
    `SELECT v.id, COALESCE(v.price_cost, p.price_cost) AS price_cost
     FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id IN (${placeholders})`,
    variantIds,
  );
  const costMap = new Map(variantCosts.map((r) => [r.id, r.price_cost]));

  for (const line of input.items) {
    const lineTotal = line.qty * line.price;
    const qtyBase = line.qty * line.unit_factor;
    const baseCost = costMap.get(line.variant_id) ?? 0;
    const cost = baseCost * line.unit_factor;

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
       VALUES (?, ?, 'return', 'orders', ?, ?, ?)`,
      [
        line.variant_id,
        sign * qtyBase,
        orderId,
        isFromCustomer
          ? `KH trả lại theo phiếu ${code} (${line.qty} ${line.unit_name})`
          : `Trả NCC theo phiếu ${code} (${line.qty} ${line.unit_name})`,
        createdAt,
      ],
    );
    await db.execute(
      `UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?`,
      [sign * qtyBase, line.variant_id],
    );
  }

  // 3. Cash transaction (chiều theo loại)
  if (paid > 0) {
    const cashType: "in" | "out" = isFromCustomer ? "out" : "in";
    const category = isFromCustomer ? "Hoàn tiền KH" : "NCC hoàn tiền";
    const noteText = isFromCustomer
      ? `Hoàn tiền KH theo phiếu ${code}`
      : `NCC hoàn tiền theo phiếu ${code}`;
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note, created_at)
       VALUES (?, ?, ?, 'orders', ?, ?, ?)`,
      [cashType, paid, category, orderId, noteText, createdAt],
    );
  }

  // 4. Công nợ: phần chưa hoàn = mình nợ KH / NCC nợ mình → giảm debt_amount của bên kia
  const remaining = total - paid;
  if (remaining > 0) {
    const table = isFromCustomer ? "customers" : "suppliers";
    await db.execute(
      `UPDATE ${table} SET debt_amount = debt_amount - ? WHERE id = ?`,
      [remaining, input.contact_id],
    );
  }

  // 5. Recompute đảm bảo debt khớp tổng timeline
  await recomputeAndSetContactDebt(
    isFromCustomer ? "customer" : "supplier",
    input.contact_id,
  );

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
export type DateFilter = {
  /** ISO date 'YYYY-MM-DD' — inclusive. Null = không filter. */
  from?: string | null;
  to?: string | null;
};

export async function listOrders(
  type: OrderType | "all" = "all",
  dateFilter: DateFilter = {},
  limit = 500,
): Promise<OrderListRow[]> {
  const db = await getDb();
  const conds = ["o.status != 'cancelled'"];
  const params: unknown[] = [];
  if (type !== "all") {
    conds.push("o.type = ?");
    params.push(type);
  }
  if (dateFilter.from) {
    conds.push("date(o.created_at) >= date(?)");
    params.push(dateFilter.from);
  }
  if (dateFilter.to) {
    conds.push("date(o.created_at) <= date(?)");
    params.push(dateFilter.to);
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

/**
 * Danh sách phiếu liên quan đến 1 sản phẩm (nhập + bán + trả), kèm SL + giá
 * của SP đó trong mỗi phiếu. Một phiếu có nhiều dòng cùng product (hiếm với
 * MVP nhưng đề phòng) → mỗi dòng order_item = 1 row.
 */
export type ProductOrderRow = {
  order_id: number;
  code: string;
  type: OrderType;
  status: OrderStatus;
  created_at: string;
  customer_id: number | null;
  supplier_id: number | null;
  partner_name: string | null;
  qty: number;
  price: number;
  unit_name: string;
  unit_factor: number;
  total: number;
  base_unit: string;
};

export async function listOrdersByProduct(
  productId: number,
  dateFilter: DateFilter = {},
): Promise<ProductOrderRow[]> {
  const db = await getDb();
  const conds = ["v.product_id = ?", "o.status != 'cancelled'"];
  const params: unknown[] = [productId];
  if (dateFilter.from) {
    conds.push("date(o.created_at) >= date(?)");
    params.push(dateFilter.from);
  }
  if (dateFilter.to) {
    conds.push("date(o.created_at) <= date(?)");
    params.push(dateFilter.to);
  }
  return await db.select<ProductOrderRow[]>(
    `SELECT
       o.id           AS order_id,
       o.code         AS code,
       o.type         AS type,
       o.status       AS status,
       o.created_at   AS created_at,
       o.customer_id  AS customer_id,
       o.supplier_id  AS supplier_id,
       COALESCE(c.name, s.name) AS partner_name,
       oi.qty         AS qty,
       oi.price       AS price,
       oi.unit_name   AS unit_name,
       oi.unit_factor AS unit_factor,
       oi.total       AS total,
       p.unit         AS base_unit
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN product_variants v ON v.id = oi.variant_id
     JOIN products p ON p.id = v.product_id
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE ${conds.join(" AND ")}
     ORDER BY o.created_at DESC, o.id DESC`,
    params,
  );
}

/**
 * Danh sách phiếu của 1 đối tác: phiếu bán cho khách hàng, phiếu nhập từ NCC.
 * Bỏ qua phiếu đã huỷ.
 */
export async function listOrdersByContact(
  kind: "customer" | "supplier",
  contactId: number,
): Promise<OrderListRow[]> {
  const db = await getDb();
  const col = kind === "customer" ? "o.customer_id" : "o.supplier_id";
  return await db.select<OrderListRow[]>(
    `SELECT
       o.*,
       COALESCE(c.name, s.name) AS partner_name,
       (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count
     FROM orders o
     LEFT JOIN customers c ON c.id = o.customer_id
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     WHERE ${col} = ? AND o.status != 'cancelled'
     ORDER BY o.created_at DESC`,
    [contactId],
  );
}

export type OrderDetail = OrderListRow;

/**
 * Tổng tiền thực mà KH đã thanh toán cho 1 đơn bán (kể cả overpay).
 * Khác với order.paid (bị cap = total) — đây sum cash IN từ cash_transactions
 * ref_table='orders' ref_id=orderId. Dùng cho hoá đơn để hiển thị đúng số
 * tiền KH thực sự đưa.
 */
export async function getActualPaidForOrder(orderId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ amt: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) AS amt
     FROM cash_transactions
     WHERE ref_table = 'orders' AND ref_id = ? AND type = 'in'`,
    [orderId],
  );
  return rows[0]?.amt ?? 0;
}

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

  // Xác định chiều đảo:
  // - sale: bán → đảo = +stock (cộng lại); cash 'in' → đảo 'out'; debt KH giảm
  // - purchase: nhập → đảo = -stock; cash 'out' → đảo 'in'; debt NCC giảm
  // - return từ KH: stock+ → đảo = -stock; cash 'out' (refund) → đảo 'in';
  //   debt KH tăng lại (vì lúc trả: customer.debt_amount -= remaining)
  // - return cho NCC: stock- → đảo = +stock; cash 'in' (refund) → đảo 'out';
  //   debt NCC tăng lại
  const isReturn = order.type === "return";
  const isCustomerSide = order.customer_id != null;

  let stockSign: 1 | -1;
  let cashReverseType: "in" | "out";
  let debtRevertSign: 1 | -1; // +1: contact.debt -= debtAmount (giảm); -1: += (tăng)

  if (isReturn) {
    if (isCustomerSide) {
      // Customer return: cancel = stock -, cash đối ứng "in", debt KH tăng
      stockSign = -1;
      cashReverseType = "in";
      debtRevertSign = -1;
    } else {
      // Supplier return: cancel = stock +, cash đối ứng "out", debt NCC tăng
      stockSign = 1;
      cashReverseType = "out";
      debtRevertSign = -1;
    }
  } else if (order.type === "sale") {
    stockSign = 1;
    cashReverseType = "out";
    debtRevertSign = 1;
  } else {
    // purchase
    stockSign = -1;
    cashReverseType = "in";
    debtRevertSign = 1;
  }

  // 1. Đảo tồn kho
  for (const it of items) {
    const qtyBase = it.qty * (it.unit_factor || 1);
    const reverseQty = stockSign * qtyBase;
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

  // 2. Đảo sổ quỹ
  if (order.paid > 0) {
    const category = isReturn
      ? isCustomerSide
        ? "Thu lại hoàn KH"
        : "Trả lại hoàn NCC"
      : order.type === "sale"
        ? "Hoàn tiền KH"
        : "NCC hoàn tiền";
    await db.execute(
      `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note)
       VALUES (?, ?, ?, 'orders', ?, ?)`,
      [cashReverseType, order.paid, category, id, `Hủy phiếu ${order.code}`],
    );
  }

  // 3. Đảo công nợ contact (phần đã đẩy vào nợ lúc tạo phiếu)
  const debtAmount = order.total - order.paid;
  if (debtAmount > 0) {
    const contactTable = isCustomerSide ? "customers" : "suppliers";
    const contactId = order.customer_id ?? order.supplier_id;
    if (contactId != null) {
      const sign = debtRevertSign; // sale/purchase: -=; return: +=
      const op = sign === 1 ? "-" : "+";
      await db.execute(
        `UPDATE ${contactTable} SET debt_amount = debt_amount ${op} ? WHERE id = ?`,
        [debtAmount, contactId],
      );
    }
  }

  // 4. Đánh dấu đơn cancelled
  await db.execute(
    `UPDATE orders SET status = 'cancelled' WHERE id = ?`,
    [id],
  );

  // 5. Recompute debt — fix edge case overpay-cancel để debt khớp tổng timeline
  const contactIdForRecompute = order.customer_id ?? order.supplier_id;
  if (contactIdForRecompute != null) {
    await recomputeAndSetContactDebt(
      isCustomerSide ? "customer" : "supplier",
      contactIdForRecompute,
    );
  }
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
      const rawUnits = await listUnitsOfProduct(info.product_id);
      // Inject snapshot factor cho unit khớp tên — đảm bảo lúc cancel+recreate
      // (edit flow) factor không lệch nếu user đã đổi product.factor sau khi
      // tạo đơn. Snapshot unit_factor trong order_items là source of truth.
      const units = rawUnits.map((u) =>
        u.name === it.unit_name ? { ...u, factor: it.unit_factor || u.factor } : u,
      );
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
