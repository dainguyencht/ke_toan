import { getDb } from "./client";
import type { Product, ProductVariant } from "@/domain/types";
import type { UnitInput } from "./units";

export type ProductWithStock = Product & {
  total_stock: number;
  variant_count: number;
  default_variant_id: number | null;
};

export type ProductInput = {
  sku: string;
  name: string;
  barcode?: string | null;
  unit?: string;
  category_id?: number | null;
  price_sell: number;
  price_cost: number;
  note?: string | null;
};

export async function listProducts(search = ""): Promise<ProductWithStock[]> {
  const db = await getDb();
  const trimmed = search.trim();
  // Tính tổng tồn từ stock_qty cache trên variants.
  const baseSelect = `
    SELECT
      p.*,
      COALESCE(SUM(v.stock_qty), 0)        AS total_stock,
      COUNT(v.id)                          AS variant_count,
      (SELECT id FROM product_variants
        WHERE product_id = p.id
        ORDER BY id LIMIT 1)               AS default_variant_id
    FROM products p
    LEFT JOIN product_variants v ON v.product_id = p.id
  `;
  if (!trimmed) {
    return await db.select<ProductWithStock[]>(
      `${baseSelect}
       WHERE p.is_archived = 0
       GROUP BY p.id
       ORDER BY p.updated_at DESC
       LIMIT 500`,
    );
  }
  const like = `%${trimmed}%`;
  return await db.select<ProductWithStock[]>(
    `${baseSelect}
     WHERE p.is_archived = 0
       AND (p.name LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)
     GROUP BY p.id
     ORDER BY p.updated_at DESC
     LIMIT 500`,
    [like, like, like],
  );
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.select<Product[]>("SELECT * FROM products WHERE id = ?", [id]);
  return rows[0] ?? null;
}

export async function getVariantsOfProduct(productId: number): Promise<ProductVariant[]> {
  const db = await getDb();
  return await db.select<ProductVariant[]>(
    "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id",
    [productId],
  );
}

/**
 * Tạo sản phẩm + 1 variant mặc định + 1 base unit (cùng tên với products.unit).
 * extraUnits: các đơn vị quy đổi thêm (không phải base).
 */
export async function createProduct(
  input: ProductInput,
  extraUnits: UnitInput[] = [],
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO products
       (sku, name, barcode, unit, category_id, price_sell, price_cost, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sku,
      input.name,
      input.barcode ?? null,
      input.unit ?? "cái",
      input.category_id ?? null,
      input.price_sell,
      input.price_cost,
      input.note ?? null,
    ],
  );
  const productId = Number(result.lastInsertId);

  await db.execute(
    `INSERT INTO product_variants (product_id, sku, attrs_json, stock_qty)
     VALUES (?, ?, '{}', 0)`,
    [productId, input.sku],
  );

  // Base unit (factor = 1)
  await db.execute(
    `INSERT INTO product_units (product_id, name, factor, price_sell, price_cost, is_base, sort_order)
     VALUES (?, ?, 1, ?, ?, 1, 0)`,
    [productId, input.unit ?? "cái", input.price_sell, input.price_cost],
  );

  // Các đơn vị quy đổi
  for (let i = 0; i < extraUnits.length; i++) {
    const u = extraUnits[i];
    await db.execute(
      `INSERT INTO product_units (product_id, name, factor, price_sell, price_cost, is_base, sort_order)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [
        productId,
        u.name.trim(),
        u.factor,
        u.price_sell ?? null,
        u.price_cost ?? null,
        i + 1,
      ],
    );
  }

  return productId;
}

export async function updateProduct(
  id: number,
  input: ProductInput,
  extraUnits: UnitInput[] = [],
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE products SET
       sku = ?, name = ?, barcode = ?, unit = ?, category_id = ?,
       price_sell = ?, price_cost = ?, note = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.sku,
      input.name,
      input.barcode ?? null,
      input.unit ?? "cái",
      input.category_id ?? null,
      input.price_sell,
      input.price_cost,
      input.note ?? null,
      id,
    ],
  );

  // Sync sku của variants (hoá đơn / OrderDetail join lên product_variants.sku).
  // MVP: 1 product có 1 variant, dùng cùng SKU. Cập nhật hết cho khớp.
  await db.execute(
    "UPDATE product_variants SET sku = ? WHERE product_id = ?",
    [input.sku, id],
  );

  // Sync base unit (đổi name/price theo product)
  await db.execute(
    `UPDATE product_units SET
       name = ?, price_sell = ?, price_cost = ?
     WHERE product_id = ? AND is_base = 1`,
    [input.unit ?? "cái", input.price_sell, input.price_cost, id],
  );

  // Replace toàn bộ extra units: xóa hết non-base rồi insert lại.
  // (Đơn giản hóa cho MVP — báo cáo cũ vẫn an toàn vì order_items snapshot unit_name/factor.)
  await db.execute(
    `DELETE FROM product_units WHERE product_id = ? AND is_base = 0`,
    [id],
  );
  for (let i = 0; i < extraUnits.length; i++) {
    const u = extraUnits[i];
    await db.execute(
      `INSERT INTO product_units (product_id, name, factor, price_sell, price_cost, is_base, sort_order)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
      [
        id,
        u.name.trim(),
        u.factor,
        u.price_sell ?? null,
        u.price_cost ?? null,
        i + 1,
      ],
    );
  }
}

export async function archiveProduct(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE products SET is_archived = 1 WHERE id = ?", [id]);
}

/**
 * Điều chỉnh tồn kho cho variant mặc định (variant đầu tiên của product).
 * Dùng khi user nhập tồn ban đầu lúc tạo sản phẩm.
 */
export async function setInitialStock(
  productId: number,
  qty: number,
  note = "Tồn đầu kỳ",
): Promise<void> {
  if (qty === 0) return;
  const db = await getDb();
  const [variant] = await db.select<ProductVariant[]>(
    "SELECT * FROM product_variants WHERE product_id = ? ORDER BY id LIMIT 1",
    [productId],
  );
  if (!variant) return;

  await db.execute(
    `INSERT INTO stock_movements (variant_id, qty_change, type, note)
     VALUES (?, ?, 'init', ?)`,
    [variant.id, qty, note],
  );
  await db.execute(
    "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
    [qty, variant.id],
  );
}
