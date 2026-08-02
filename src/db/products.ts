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

/**
 * Tổng giá trị hàng tồn kho theo giá vốn = Σ(stock_qty × giá vốn).
 * Dùng giá vốn variant nếu có, không thì fallback giá vốn product.
 * Tính trên toàn bộ SP chưa ẩn (không theo filter/limit của danh sách).
 */
export async function getTotalStockValue(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ value: number }[]>(
    `SELECT COALESCE(SUM(v.stock_qty * COALESCE(v.price_cost, p.price_cost)), 0) AS value
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE p.is_archived = 0`,
  );
  return rows[0]?.value ?? 0;
}

export type StockCountRow = {
  variant_id: number;
  product_id: number;
  sku: string;
  product_name: string;
  attrs_json: string;
  base_unit: string;
  /** Tồn hệ thống tính đến cuối ngày kiểm (cộng dồn stock_movements tới ngày). */
  system_stock: number;
};

/**
 * Kiểm kho: tồn hệ thống của từng variant tính ĐẾN CUỐI ngày `date`
 * ('YYYY-MM-DD'), cộng dồn stock_movements có created_at <= 'date 23:59:59'.
 * 1 dòng / variant (SP nhiều biến thể hiện từng biến thể).
 */
export async function listStockAsOf(
  date: string,
  search = "",
): Promise<StockCountRow[]> {
  const db = await getDb();
  const cutoff = `${date} 23:59:59`;
  const trimmed = search.trim();
  const base = `
    SELECT
      v.id                                AS variant_id,
      p.id                                AS product_id,
      v.sku                               AS sku,
      p.name                              AS product_name,
      v.attrs_json                        AS attrs_json,
      p.unit                              AS base_unit,
      COALESCE((SELECT SUM(m.qty_change) FROM stock_movements m
                WHERE m.variant_id = v.id AND m.created_at <= ?), 0) AS system_stock
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    WHERE p.is_archived = 0
  `;
  if (!trimmed) {
    return await db.select<StockCountRow[]>(
      `${base} ORDER BY p.name, v.id`,
      [cutoff],
    );
  }
  const like = `%${trimmed}%`;
  return await db.select<StockCountRow[]>(
    `${base} AND (p.name LIKE ? OR v.sku LIKE ? OR p.barcode LIKE ?)
     ORDER BY p.name, v.id`,
    [cutoff, like, like, like],
  );
}

export type StockCountEntry = {
  variant_id: number;
  system_stock: number;
  counted: number;
};

/**
 * Cân bằng kho: với mỗi variant có lệch (counted != system_stock), ghi 1
 * stock_movement type='adjust' với qty_change = counted − system_stock, đề ngày
 * cuối ngày kiểm (`date` 23:59:59) để các phát sinh sau ngày vẫn cộng lên trên.
 * Cập nhật cache stock_qty tương ứng. Trả về số dòng đã điều chỉnh.
 */
export async function balanceStock(
  date: string,
  entries: StockCountEntry[],
): Promise<number> {
  const db = await getDb();
  const stamp = `${date} 23:59:59`;
  let adjusted = 0;
  for (const e of entries) {
    const diff = e.counted - e.system_stock;
    if (diff === 0) continue;
    const note = `Kiểm kho ${date}: HT ${e.system_stock} → TT ${e.counted}`;
    await db.execute(
      `INSERT INTO stock_movements (variant_id, qty_change, type, note, created_at)
       VALUES (?, ?, 'adjust', ?, ?)`,
      [e.variant_id, diff, note, stamp],
    );
    await db.execute(
      "UPDATE product_variants SET stock_qty = stock_qty + ? WHERE id = ?",
      [diff, e.variant_id],
    );
    adjusted++;
  }
  return adjusted;
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
