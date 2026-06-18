import { getDb } from "./client";
import { dbDateTime } from "@/lib/utils";
import type { Customer, Supplier } from "@/domain/types";

export type ContactKind = "customer" | "supplier";
export type Contact = Customer | Supplier;

export type ContactInput = {
  name: string;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
};

const TABLE: Record<ContactKind, string> = {
  customer: "customers",
  supplier: "suppliers",
};

/** Tổng dư nợ của tất cả KH hoặc NCC (gồm cả âm = trả trước). */
export async function getTotalDebt(kind: ContactKind): Promise<number> {
  const db = await getDb();
  const table = TABLE[kind];
  const rows = await db.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(debt_amount), 0) AS total FROM ${table}`,
  );
  return rows[0]?.total ?? 0;
}

export async function listContacts(kind: ContactKind, search = ""): Promise<Contact[]> {
  const db = await getDb();
  const table = TABLE[kind];
  const trimmed = search.trim();
  if (!trimmed) {
    return await db.select<Contact[]>(
      `SELECT * FROM ${table} ORDER BY created_at DESC LIMIT 500`,
    );
  }
  const like = `%${trimmed}%`;
  return await db.select<Contact[]>(
    `SELECT * FROM ${table}
     WHERE name LIKE ? OR phone LIKE ?
     ORDER BY created_at DESC
     LIMIT 500`,
    [like, like],
  );
}

export async function getContact(kind: ContactKind, id: number): Promise<Contact | null> {
  const db = await getDb();
  const table = TABLE[kind];
  const rows = await db.select<Contact[]>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
  return rows[0] ?? null;
}

export async function createContact(kind: ContactKind, input: ContactInput): Promise<number> {
  const db = await getDb();
  const table = TABLE[kind];
  const result = await db.execute(
    `INSERT INTO ${table} (name, phone, address, note) VALUES (?, ?, ?, ?)`,
    [input.name, input.phone ?? null, input.address ?? null, input.note ?? null],
  );
  return Number(result.lastInsertId);
}

export async function updateContact(
  kind: ContactKind,
  id: number,
  input: ContactInput,
): Promise<void> {
  const db = await getDb();
  const table = TABLE[kind];
  await db.execute(
    `UPDATE ${table} SET name = ?, phone = ?, address = ?, note = ? WHERE id = ?`,
    [input.name, input.phone ?? null, input.address ?? null, input.note ?? null, id],
  );
}

export async function deleteContact(kind: ContactKind, id: number): Promise<void> {
  const db = await getDb();
  const table = TABLE[kind];
  // Note: ON DELETE SET NULL trên orders.customer_id / supplier_id, nên xóa được kể cả khi có đơn cũ.
  await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

/**
 * Thu nợ KH (kind='customer') hoặc trả nợ NCC (kind='supplier').
 * - Tạo cash_transaction (in cho KH, out cho NCC)
 * - Giảm debt_amount của contact tương ứng
 * - Validate: amount > 0 và <= debt hiện tại
 */
export async function payDebt(
  kind: ContactKind,
  contactId: number,
  amount: number,
  note?: string | null,
  createdAt?: string,
): Promise<void> {
  if (amount <= 0) throw new Error("Số tiền phải > 0");

  const db = await getDb();
  const table = TABLE[kind];
  const rows = await db.select<{ debt_amount: number; name: string }[]>(
    `SELECT debt_amount, name FROM ${table} WHERE id = ?`,
    [contactId],
  );
  const c = rows[0];
  if (!c) throw new Error("Không tìm thấy đối tác");

  // Cho phép trả tiền vượt công nợ (KH/NCC trả trước → dư nợ âm)

  const cashType: "in" | "out" = kind === "customer" ? "in" : "out";
  const category = kind === "customer" ? "Thu công nợ KH" : "Trả công nợ NCC";
  const finalNote = note?.trim() || `${category}: ${c.name}`;

  await db.execute(
    `INSERT INTO cash_transactions (type, amount, category, ref_table, ref_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      cashType,
      amount,
      category,
      table,
      contactId,
      finalNote,
      createdAt ?? dbDateTime(),
    ],
  );
  await db.execute(
    `UPDATE ${table} SET debt_amount = debt_amount - ? WHERE id = ?`,
    [amount, contactId],
  );
}

/**
 * Xoá phiếu thu nợ / trả nợ — đảo ngược: cộng lại công nợ + xoá cash_transaction.
 * Chỉ áp dụng cho giao dịch ref_table='customers'|'suppliers' (sinh từ payDebt).
 */
/**
 * Đặt thẳng debt_amount cho contact. Dùng để fix data lệch khi tổng timeline
 * không khớp contact.debt_amount (do bug cũ hoặc edge case cancel/overpay).
 */
export async function setContactDebt(
  kind: ContactKind,
  contactId: number,
  newDebt: number,
): Promise<void> {
  const db = await getDb();
  const table = TABLE[kind];
  await db.execute(`UPDATE ${table} SET debt_amount = ? WHERE id = ?`, [
    newDebt,
    contactId,
  ]);
}

/** Phiếu điều chỉnh dư nợ — track lịch sử khi user sửa thẳng debt_amount. */
export type DebtAdjustment = {
  id: number;
  code: string;
  kind: ContactKind;
  contact_id: number;
  old_debt: number;
  new_debt: number;
  change_amount: number;
  note: string | null;
  created_at: string;
};

async function generateAdjustmentCode(dateStr?: string): Promise<string> {
  const db = await getDb();
  if (!dateStr) {
    const today = new Date();
    dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
  }
  const like = `DC-${dateStr}-%`;
  const rows = await db.select<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM debt_adjustments WHERE code LIKE ?",
    [like],
  );
  const next = (rows[0]?.c ?? 0) + 1;
  return `DC-${dateStr}-${String(next).padStart(3, "0")}`;
}

/**
 * Điều chỉnh dư nợ KH/NCC + tạo phiếu DC để track audit trail.
 * Khác với setContactDebt: cái này CÓ ghi vào lịch sử.
 */
export async function createDebtAdjustment(
  kind: ContactKind,
  contactId: number,
  newDebt: number,
  note?: string | null,
  createdAt?: string,
): Promise<number> {
  const db = await getDb();
  const table = TABLE[kind];
  const rows = await db.select<{ debt_amount: number }[]>(
    `SELECT debt_amount FROM ${table} WHERE id = ?`,
    [contactId],
  );
  if (rows.length === 0) throw new Error("Không tìm thấy KH/NCC");
  const oldDebt = rows[0].debt_amount ?? 0;
  if (newDebt === oldDebt) return 0;

  const ts = createdAt ?? dbDateTime();
  const code = await generateAdjustmentCode(ts.slice(0, 10).replace(/-/g, ""));
  const change = newDebt - oldDebt;

  const result = await db.execute(
    `INSERT INTO debt_adjustments
       (code, kind, contact_id, old_debt, new_debt, change_amount, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [code, kind, contactId, oldDebt, newDebt, change, note ?? null, ts],
  );

  await db.execute(`UPDATE ${table} SET debt_amount = ? WHERE id = ?`, [
    newDebt,
    contactId,
  ]);

  return Number(result.lastInsertId);
}

export async function listDebtAdjustments(
  kind: ContactKind,
  contactId: number,
): Promise<DebtAdjustment[]> {
  const db = await getDb();
  return await db.select<DebtAdjustment[]>(
    `SELECT * FROM debt_adjustments
     WHERE kind = ? AND contact_id = ?
     ORDER BY created_at DESC`,
    [kind, contactId],
  );
}

/** Sửa phiếu điều chỉnh (new_debt / note / created_at). Auto sync contact.debt. */
export async function updateDebtAdjustment(
  id: number,
  patch: {
    newDebt?: number;
    note?: string | null;
    createdAt?: string;
  },
): Promise<void> {
  const db = await getDb();
  const rows = await db.select<DebtAdjustment[]>(
    "SELECT * FROM debt_adjustments WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new Error("Không tìm thấy phiếu điều chỉnh");
  const adj = rows[0];

  const newDebt = patch.newDebt ?? adj.new_debt;
  const newChange = newDebt - adj.old_debt;
  const changeDiff = newChange - adj.change_amount;
  const note = patch.note !== undefined ? patch.note : adj.note;
  const createdAt = patch.createdAt ?? adj.created_at;

  if (changeDiff !== 0) {
    const table = TABLE[adj.kind];
    await db.execute(
      `UPDATE ${table} SET debt_amount = debt_amount + ? WHERE id = ?`,
      [changeDiff, adj.contact_id],
    );
  }
  await db.execute(
    `UPDATE debt_adjustments
     SET new_debt = ?, change_amount = ?, note = ?, created_at = ?
     WHERE id = ?`,
    [newDebt, newChange, note, createdAt, id],
  );
}

/** Xoá phiếu điều chỉnh — đảo ngược change_amount khỏi dư nợ contact. */
export async function deleteDebtAdjustment(id: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<
    { kind: string; contact_id: number; change_amount: number }[]
  >(
    "SELECT kind, contact_id, change_amount FROM debt_adjustments WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new Error("Không tìm thấy phiếu điều chỉnh");
  const r = rows[0];
  const table = TABLE[r.kind as ContactKind];
  await db.execute(
    `UPDATE ${table} SET debt_amount = debt_amount - ? WHERE id = ?`,
    [r.change_amount, r.contact_id],
  );
  await db.execute("DELETE FROM debt_adjustments WHERE id = ?", [id]);
}

export async function deleteDebtPayment(id: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<
    { amount: number; ref_table: string | null; ref_id: number | null }[]
  >(
    "SELECT amount, ref_table, ref_id FROM cash_transactions WHERE id = ?",
    [id],
  );
  if (rows.length === 0) throw new Error("Không tìm thấy giao dịch");
  const tx = rows[0];
  if (tx.ref_table !== "customers" && tx.ref_table !== "suppliers") {
    throw new Error(
      "Chỉ áp dụng cho phiếu thu/trả nợ. Giao dịch từ đơn hàng phải sửa qua đơn.",
    );
  }
  if (tx.ref_id == null) throw new Error("Giao dịch không hợp lệ (thiếu ref_id)");

  await db.execute(
    `UPDATE ${tx.ref_table} SET debt_amount = debt_amount + ? WHERE id = ?`,
    [tx.amount, tx.ref_id],
  );
  await db.execute("DELETE FROM cash_transactions WHERE id = ?", [id]);
}
