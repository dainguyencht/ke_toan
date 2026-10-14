import { getDb } from "./client";
import type { Product, ProductVariant } from "@/domain/types";
import { replayCostHistory, type CostEvent } from "@/domain/costing";
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
 * Tổng giá trị hàng tồn kho = tổng bể giá trị của các SP chưa ẩn.
 * Lấy thẳng products.stock_value (bình quân gia quyền) thay vì nhân
 * tồn × giá vốn - tích số bị lệch do làm tròn giá vốn bình quân.
 */
export async function getTotalStockValue(): Promise<number> {
  const db = await getDb();
  // Chỉ tính SP đang có hàng: SP tồn <= 0 vẫn có thể giữ giá trị trong bể
  // (quy tắc hàng thực có) nhưng không có hàng để định giá.
  const rows = await db.select<{ value: number }[]>(
    `SELECT COALESCE(SUM(MAX(p.stock_value, 0)), 0) AS value
     FROM products p
     WHERE p.is_archived = 0
       AND COALESCE((SELECT SUM(v.stock_qty) FROM product_variants v
                     WHERE v.product_id = p.id), 0) > 0`,
  );
  return rows[0]?.value ?? 0;
}

/**
 * Tính lại giá vốn của 1 sản phẩm bằng cách phát lại toàn bộ lịch sử kho
 * (xem src/domain/costing.ts). Ghi lại products.stock_value / price_cost
 * (bể giá trị + giá vốn bình quân hiện hành) và order_items.cost của các dòng
 * phiếu NHẬP (= giá nhập thực đã trừ chiết khấu, để hiển thị).
 *
 * Ghi lại order_items.cost CHỈ cho dòng phiếu nhập (= giá nhập thực đã trừ
 * chiết khấu). Phiếu bán/trả CHỐT giá vốn lúc tạo và không bị ghi đè (KiotViet):
 * sửa phiếu nhập cũ chỉ đổi giá vốn hiện hành và các đơn bán SAU đó.
 *
 * GỌI SAU MỌI biến động kho của sản phẩm (nhập, bán, trả, huỷ, kiểm kho...).
 * Rẻ: 3 query + vài UPDATE, lịch sử 1 SP của hộ kinh doanh chỉ vài trăm dòng.
 */
export async function recomputeProductCost(
  productId: number,
  /** Có runId → ghi giá vốn cũ/mới từng dòng phiếu vào cost_backfill_item_log */
  runId?: string,
): Promise<void> {
  const db = await getDb();

  const items = await db.select<
    {
      item_id: number;
      created_at: string;
      type: "sale" | "purchase" | "return";
      customer_id: number | null;
      qty: number;
      price: number;
      cost: number;
      unit_factor: number;
      subtotal: number;
      total: number;
    }[]
  >(
    `SELECT i.id AS item_id, o.created_at, o.type, o.customer_id,
            i.qty, i.price, i.cost, COALESCE(i.unit_factor, 1) AS unit_factor,
            o.subtotal, o.total
     FROM order_items i
     JOIN orders o ON o.id = i.order_id
     JOIN product_variants v ON v.id = i.variant_id
     WHERE v.product_id = ? AND o.status != 'cancelled'`,
    [productId],
  );
  const adjusts = await db.select<
    { id: number; created_at: string; qty_change: number }[]
  >(
    `SELECT m.id, m.created_at, m.qty_change
     FROM stock_movements m
     JOIN product_variants v ON v.id = m.variant_id
     WHERE v.product_id = ?
       AND (m.ref_table IS NULL OR m.ref_table != 'orders')`,
    [productId],
  );
  const prod = await db.select<{ price_cost: number }[]>(
    "SELECT price_cost FROM products WHERE id = ?",
    [productId],
  );

  const events: CostEvent[] = [];
  for (const it of items) {
    if (it.type === "purchase") {
      events.push({
        kind: "purchase",
        at: it.created_at,
        itemId: it.item_id,
        qty: it.qty,
        price: it.price,
        factor: it.unit_factor,
        orderSubtotal: it.subtotal,
        orderTotal: it.total,
      });
    } else {
      events.push({
        kind: it.type,
        at: it.created_at,
        itemId: it.item_id,
        qty: it.qty,
        factor: it.unit_factor,
        // bán: ra; trả hàng từ KH: vào; trả hàng cho NCC: ra
        direction: it.type === "sale" ? -1 : it.customer_id != null ? 1 : -1,
        cost: it.cost ?? 0, // giá vốn đã chốt lúc tạo phiếu
      });
    }
  }
  for (const m of adjusts) {
    events.push({ kind: "adjust", at: m.created_at, id: m.id, qtyChange: m.qty_change });
  }

  // Giá vốn người dùng đặt tay chỉ là mốc khi SP chưa có phiếu nhập (tồn đầu kỳ)
  const r = replayCostHistory(events, prod[0]?.price_cost ?? 0);

  await db.execute(
    `UPDATE products
        SET stock_value = ?, price_cost = ?, updated_at = datetime('now')
      WHERE id = ?`,
    [r.stockValue, r.avgCost, productId],
  );
  const oldCost = new Map(items.map((it) => [it.item_id, it.cost ?? 0]));
  for (const [itemId, cost] of r.itemCosts) {
    const prev = oldCost.get(itemId);
    if (prev !== undefined && Math.abs(prev - cost) < 1e-6) continue;
    await db.execute("UPDATE order_items SET cost = ? WHERE id = ?", [cost, itemId]);
    if (runId) {
      await db.execute(
        `INSERT INTO cost_backfill_item_log (run_id, order_item_id, old_cost, new_cost)
         VALUES (?, ?, ?, ?)`,
        [runId, itemId, prev ?? 0, cost],
      );
    }
  }
}

/** Tiện cho chỗ chỉ biết variant_id. */
export async function recomputeProductCostByVariant(variantId: number): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ product_id: number }[]>(
    "SELECT product_id FROM product_variants WHERE id = ?",
    [variantId],
  );
  if (rows[0]) await recomputeProductCost(rows[0].product_id);
}

export type CostRecomputeSummary = {
  run_id: string;
  total: number;
  /** Số SP có giá vốn/giá trị tồn thay đổi */
  changed: number;
};

/**
 * Phát lại cho MỌI sản phẩm - sau nâng cấp hoặc bấm tay ở Cài đặt.
 * Ghi nhật ký TRƯỚC/SAU vào cost_backfill_log cho mỗi SP có thay đổi, để truy
 * lại giá vốn cũ và khôi phục tay nếu cần.
 */
export async function recomputeAllProductCosts(
  reason: "upgrade" | "manual",
): Promise<CostRecomputeSummary> {
  const db = await getDb();
  const runId = `${reason}-${Date.now()}`;
  const before = await db.select<
    { id: number; price_cost: number; stock_value: number }[]
  >("SELECT id, price_cost, stock_value FROM products");

  let changed = 0;
  for (const p of before) {
    await recomputeProductCost(p.id, runId);
    const after = await db.select<{ price_cost: number; stock_value: number }[]>(
      "SELECT price_cost, stock_value FROM products WHERE id = ?",
      [p.id],
    );
    const a = after[0];
    if (!a) continue;
    const same =
      Math.abs((p.price_cost ?? 0) - (a.price_cost ?? 0)) < 1e-6 &&
      Math.abs((p.stock_value ?? 0) - (a.stock_value ?? 0)) < 1e-6;
    if (same) continue;
    changed++;
    await db.execute(
      `INSERT INTO cost_backfill_log
         (run_id, reason, product_id, old_price_cost, old_stock_value,
          new_price_cost, new_stock_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [runId, reason, p.id, p.price_cost ?? 0, p.stock_value ?? 0,
       a.price_cost ?? 0, a.stock_value ?? 0],
    );
  }
  return { run_id: runId, total: before.length, changed };
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
    await recomputeProductCostByVariant(e.variant_id);
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
  await recomputeProductCost(id);
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
  await recomputeProductCostByVariant(variant.id);
}
