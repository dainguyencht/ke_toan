import { getDb } from "./client";
import { dbDateTime } from "@/lib/utils";
import type { CashTransaction } from "@/domain/types";

export type CashFilter = {
  type?: "in" | "out" | "all";
  from?: string | null; // ISO date 'YYYY-MM-DD'
  to?: string | null;
};

export type CashRow = CashTransaction & {
  source_label: string | null; // mã đơn, hoặc "KH: <tên>" / "NCC: <tên>"
};

export type CashInput = {
  type: "in" | "out";
  amount: number;
  category: string | null;
  note?: string | null;
  /** Ngày giờ giao dịch dạng 'YYYY-MM-DD HH:MM:SS'. Bỏ trống = thời điểm hiện tại. */
  created_at?: string;
};

export type CashSummary = {
  total_in: number;
  total_out: number;
  balance: number;
};

function buildFilterClause(f: CashFilter): { clause: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (f.type && f.type !== "all") {
    conds.push("type = ?");
    params.push(f.type);
  }
  if (f.from) {
    conds.push("date(created_at) >= date(?)");
    params.push(f.from);
  }
  if (f.to) {
    conds.push("date(created_at) <= date(?)");
    params.push(f.to);
  }
  return {
    clause: conds.length ? "WHERE " + conds.join(" AND ") : "",
    params,
  };
}

export async function listCashTransactions(filter: CashFilter = {}): Promise<CashRow[]> {
  const db = await getDb();
  const { clause, params } = buildFilterClause(filter);
  return await db.select<CashRow[]>(
    `SELECT
       ct.*,
       CASE ct.ref_table
         WHEN 'orders'    THEN (SELECT code FROM orders WHERE id = ct.ref_id)
         WHEN 'customers' THEN 'KH: '  || (SELECT name FROM customers WHERE id = ct.ref_id)
         WHEN 'suppliers' THEN 'NCC: ' || (SELECT name FROM suppliers WHERE id = ct.ref_id)
       END AS source_label
     FROM cash_transactions ct
     ${clause}
     ORDER BY ct.created_at DESC
     LIMIT 500`,
    params,
  );
}

export async function getCashSummary(filter: CashFilter = {}): Promise<CashSummary> {
  const db = await getDb();
  const { clause, params } = buildFilterClause({ ...filter, type: "all" });
  const rows = await db.select<{ type: "in" | "out"; total: number }[]>(
    `SELECT type, COALESCE(SUM(amount), 0) AS total
     FROM cash_transactions
     ${clause}
     GROUP BY type`,
    params,
  );
  const total_in = rows.find((r) => r.type === "in")?.total ?? 0;
  const total_out = rows.find((r) => r.type === "out")?.total ?? 0;
  return { total_in, total_out, balance: total_in - total_out };
}

/**
 * Toàn bộ cash flow của 1 đối tác:
 *  - Phiếu thu nợ / trả nợ (ref_table='customers'/'suppliers')
 *  - Tiền thu/trả lúc tạo phiếu mua/bán (ref_table='orders' của đối tác này)
 *  - Hoàn tiền lúc trả hàng (ref_table='orders' của return order)
 * Bỏ qua giao dịch liên quan đơn cancelled.
 */
export async function listContactCashFlow(
  kind: "customer" | "supplier",
  contactId: number,
): Promise<CashTransaction[]> {
  const db = await getDb();
  const table = kind === "customer" ? "customers" : "suppliers";
  const orderCol = kind === "customer" ? "customer_id" : "supplier_id";
  return await db.select<CashTransaction[]>(
    `SELECT * FROM cash_transactions
     WHERE (ref_table = ? AND ref_id = ?)
        OR (ref_table = 'orders' AND ref_id IN (
              SELECT id FROM orders
              WHERE ${orderCol} = ? AND status != 'cancelled'
            ))
     ORDER BY created_at`,
    [table, contactId, contactId],
  );
}

export async function createCashTransaction(input: CashInput): Promise<number> {
  const db = await getDb();
  if (input.amount <= 0) throw new Error("Số tiền phải > 0");
  const result = await db.execute(
    `INSERT INTO cash_transactions (type, amount, category, note, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.type,
      input.amount,
      input.category ?? null,
      input.note ?? null,
      input.created_at ?? dbDateTime(),
    ],
  );
  return Number(result.lastInsertId);
}

/**
 * Sửa riêng ngày giờ của 1 giao dịch — áp dụng cho MỌI giao dịch,
 * kể cả giao dịch tự sinh từ đơn hàng / thu-trả nợ.
 */
export async function updateCashTransactionDate(
  id: number,
  createdAt: string,
): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE cash_transactions SET created_at = ? WHERE id = ?", [
    createdAt,
    id,
  ]);
}

/**
 * Sửa số tiền + ngày giờ của giao dịch CÓ LIÊN KẾT (ref_table='orders' hoặc
 * 'customers'/'suppliers'). Tự sync nợ contact và order.paid để dữ liệu không lệch.
 *
 * - ref_table='orders' (thu/trả tại đơn, hoàn tiền return):
 *   + cash.amount = newAmount; order.paid = min(newAmount, order.total); order.status update
 *   + Sale/Purchase (cash giảm nợ): contact.debt_amount -= delta
 *   + Return (cash là refund, tăng obligation): contact.debt_amount += delta
 *
 * - ref_table='customers'/'suppliers' (payDebt - thu/trả nợ):
 *   + cash.amount = newAmount; contact.debt_amount -= delta
 */
export async function updateLinkedCash(
  id: number,
  newAmount: number,
  newCreatedAt: string,
): Promise<void> {
  if (newAmount <= 0) throw new Error("Số tiền phải > 0");
  const db = await getDb();
  const rows = await db.select<CashTransaction[]>(
    "SELECT * FROM cash_transactions WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new Error("Không tìm thấy giao dịch");
  const cash = rows[0];
  const delta = newAmount - cash.amount;

  // Update cash trước
  await db.execute(
    "UPDATE cash_transactions SET amount = ?, created_at = ? WHERE id = ?",
    [newAmount, newCreatedAt, id],
  );

  if (delta === 0) return;

  // Sync entity liên kết
  if (cash.ref_table === "orders" && cash.ref_id != null) {
    const orderRows = await db.select<
      {
        id: number;
        type: "sale" | "purchase" | "return";
        customer_id: number | null;
        supplier_id: number | null;
        total: number;
        status: string;
      }[]
    >(
      "SELECT id, type, customer_id, supplier_id, total, status FROM orders WHERE id = ?",
      [cash.ref_id],
    );
    if (orderRows.length === 0) return;
    const order = orderRows[0];

    // Sale/purchase: cash IN/OUT giảm nợ → cash tăng → nợ giảm
    // Return: cash là refund, tăng obligation → cash tăng → nợ tăng
    const reducesDebt = order.type !== "return";
    const debtChange = (reducesDebt ? -1 : 1) * delta;

    const contactTable = order.customer_id != null ? "customers" : "suppliers";
    const contactId = order.customer_id ?? order.supplier_id;
    if (contactId != null) {
      await db.execute(
        `UPDATE ${contactTable} SET debt_amount = debt_amount + ? WHERE id = ?`,
        [debtChange, contactId],
      );
    }

    // Sync order.paid = min(newAmount, total); status update
    const newPaid = Math.min(newAmount, order.total);
    let newStatus = order.status;
    if (newPaid >= order.total) newStatus = "paid";
    else if (order.status === "paid") newStatus = "delivered";
    await db.execute("UPDATE orders SET paid = ?, status = ? WHERE id = ?", [
      newPaid,
      newStatus,
      order.id,
    ]);
  } else if (
    (cash.ref_table === "customers" || cash.ref_table === "suppliers") &&
    cash.ref_id != null
  ) {
    // payDebt: cash giảm nợ → cash tăng → nợ giảm thêm delta
    await db.execute(
      `UPDATE ${cash.ref_table} SET debt_amount = debt_amount + ? WHERE id = ?`,
      [-delta, cash.ref_id],
    );
  }
  // ref_table = null → không cần sync (manual cash)
}

/**
 * Sửa giao dịch ghi tay. Không cho sửa giao dịch tự sinh từ đơn hàng
 * (ref_table='orders') — phải sửa đơn hàng tương ứng.
 */
export async function updateCashTransaction(
  id: number,
  input: CashInput,
): Promise<void> {
  const db = await getDb();
  if (input.amount <= 0) throw new Error("Số tiền phải > 0");
  const rows = await db.select<{ ref_table: string | null }[]>(
    "SELECT ref_table FROM cash_transactions WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new Error("Không tìm thấy giao dịch");
  if (rows[0].ref_table) {
    throw new Error(
      "Không thể sửa giao dịch tự sinh từ đơn hàng. Hãy sửa đơn hàng tương ứng.",
    );
  }
  await db.execute(
    `UPDATE cash_transactions
        SET type = ?, amount = ?, category = ?, note = ?, created_at = ?
      WHERE id = ?`,
    [
      input.type,
      input.amount,
      input.category ?? null,
      input.note ?? null,
      input.created_at ?? dbDateTime(),
      id,
    ],
  );
}

export async function deleteCashTransaction(id: number): Promise<void> {
  const db = await getDb();
  // Chỉ cho xóa các giao dịch nhập tay (không có ref_table='orders')
  const rows = await db.select<{ ref_table: string | null }[]>(
    "SELECT ref_table FROM cash_transactions WHERE id = ?",
    [id],
  );
  if (rows[0]?.ref_table) {
    throw new Error(
      "Không thể xóa giao dịch tự sinh từ đơn hàng. Hãy hủy đơn hàng tương ứng.",
    );
  }
  await db.execute("DELETE FROM cash_transactions WHERE id = ?", [id]);
}
