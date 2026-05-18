import { getDb } from "./client";
import type { ProductUnit } from "@/domain/types";

export type UnitInput = {
  name: string;
  factor: number;
  price_sell?: number | null; // null = sẽ tính từ base
  price_cost?: number | null;
  is_base?: boolean;
};

export async function listUnitsOfProduct(productId: number): Promise<ProductUnit[]> {
  const db = await getDb();
  return await db.select<ProductUnit[]>(
    `SELECT * FROM product_units
     WHERE product_id = ?
     ORDER BY is_base DESC, sort_order, id`,
    [productId],
  );
}

/**
 * Lấy đơn vị cơ bản của 1 SP (luôn có 1 base unit per product sau migration).
 */
export async function getBaseUnit(productId: number): Promise<ProductUnit | null> {
  const db = await getDb();
  const rows = await db.select<ProductUnit[]>(
    `SELECT * FROM product_units WHERE product_id = ? AND is_base = 1 LIMIT 1`,
    [productId],
  );
  return rows[0] ?? null;
}

export async function createUnit(productId: number, input: UnitInput): Promise<number> {
  const db = await getDb();
  if (input.factor <= 0) throw new Error("Hệ số quy đổi phải > 0");
  const result = await db.execute(
    `INSERT INTO product_units (product_id, name, factor, price_sell, price_cost, is_base, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order)+1 FROM product_units WHERE product_id = ?), 0))`,
    [
      productId,
      input.name.trim(),
      input.factor,
      input.price_sell ?? null,
      input.price_cost ?? null,
      input.is_base ? 1 : 0,
      productId,
    ],
  );
  return Number(result.lastInsertId);
}

export async function updateUnit(id: number, input: UnitInput): Promise<void> {
  const db = await getDb();
  if (input.factor <= 0) throw new Error("Hệ số quy đổi phải > 0");
  await db.execute(
    `UPDATE product_units SET
       name = ?, factor = ?, price_sell = ?, price_cost = ?
     WHERE id = ?`,
    [
      input.name.trim(),
      input.factor,
      input.price_sell ?? null,
      input.price_cost ?? null,
      id,
    ],
  );
}

export async function deleteUnit(id: number): Promise<void> {
  const db = await getDb();
  // Không cho xóa base unit
  const rows = await db.select<{ is_base: number }[]>(
    `SELECT is_base FROM product_units WHERE id = ?`,
    [id],
  );
  if (rows[0]?.is_base === 1) {
    throw new Error("Không thể xóa đơn vị cơ bản");
  }
  await db.execute(`DELETE FROM product_units WHERE id = ?`, [id]);
}

/** Tính giá bán hiệu lực của 1 unit (override hoặc base × factor) */
export function effectivePriceSell(
  unit: ProductUnit,
  productBasePrice: number,
): number {
  return unit.price_sell ?? productBasePrice * unit.factor;
}

/** Tính giá vốn hiệu lực của 1 unit */
export function effectivePriceCost(
  unit: ProductUnit,
  productBaseCost: number,
): number {
  return unit.price_cost ?? productBaseCost * unit.factor;
}
