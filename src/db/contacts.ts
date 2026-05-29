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

export async function listContacts(kind: ContactKind, search = ""): Promise<Contact[]> {
  const db = await getDb();
  const table = TABLE[kind];
  const like = `%${search.trim()}%`;
  return await db.select<Contact[]>(
    `SELECT * FROM ${table}
     WHERE ? = '' OR name LIKE ? OR phone LIKE ?
     ORDER BY created_at DESC
     LIMIT 500`,
    [search.trim(), like, like],
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
