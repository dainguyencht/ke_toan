import { getDb } from "./client";

export type DashboardStats = {
  revenue_today: number;
  revenue_7d: number;
  orders_today: number;
  orders_7d: number;
  debt_receivable: number;
  debt_payable: number;
  cash_balance: number;
  low_stock_count: number;
};

export async function getDashboardStats(lowStockThreshold = 5): Promise<DashboardStats> {
  const db = await getDb();
  // Tách thành các query nhỏ - SQLite local là rất nhanh, no need to over-optimize.
  const [
    revenueTodayRows,
    revenue7dRows,
    debtRecvRows,
    debtPayRows,
    cashRows,
    lowStockRows,
  ] = await Promise.all([
    db.select<{ total: number; count: number }[]>(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
       FROM orders
       WHERE type='sale' AND status != 'cancelled'
         AND date(created_at) = date('now','localtime')`,
    ),
    db.select<{ total: number; count: number }[]>(
      `SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count
       FROM orders
       WHERE type='sale' AND status != 'cancelled'
         AND date(created_at) >= date('now','localtime','-6 days')`,
    ),
    db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(debt_amount), 0) AS total FROM customers`,
    ),
    db.select<{ total: number }[]>(
      `SELECT COALESCE(SUM(debt_amount), 0) AS total FROM suppliers`,
    ),
    db.select<{ type: "in" | "out"; total: number }[]>(
      `SELECT type, COALESCE(SUM(amount), 0) AS total
       FROM cash_transactions GROUP BY type`,
    ),
    db.select<{ count: number }[]>(
      `SELECT COUNT(*) AS count
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE p.is_archived = 0 AND v.stock_qty <= ?`,
      [lowStockThreshold],
    ),
  ]);

  const cashIn = cashRows.find((r) => r.type === "in")?.total ?? 0;
  const cashOut = cashRows.find((r) => r.type === "out")?.total ?? 0;

  return {
    revenue_today: revenueTodayRows[0]?.total ?? 0,
    orders_today: revenueTodayRows[0]?.count ?? 0,
    revenue_7d: revenue7dRows[0]?.total ?? 0,
    orders_7d: revenue7dRows[0]?.count ?? 0,
    debt_receivable: debtRecvRows[0]?.total ?? 0,
    debt_payable: debtPayRows[0]?.total ?? 0,
    cash_balance: cashIn - cashOut,
    low_stock_count: lowStockRows[0]?.count ?? 0,
  };
}

export type TopProduct = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  total_qty: number;
  total_revenue: number;
};

export async function getTopSellingProducts(
  days: number,
  limit = 10,
): Promise<TopProduct[]> {
  const db = await getDb();
  return await db.select<TopProduct[]>(
    `SELECT
       i.variant_id,
       v.product_id,
       p.name AS product_name,
       v.sku  AS sku,
       SUM(i.qty)   AS total_qty,
       SUM(i.total) AS total_revenue
     FROM order_items i
     JOIN orders o           ON o.id = i.order_id
     JOIN product_variants v ON v.id = i.variant_id
     JOIN products p         ON p.id = v.product_id
     WHERE o.type='sale' AND o.status != 'cancelled'
       AND date(o.created_at) >= date('now','localtime',?)
     GROUP BY i.variant_id
     ORDER BY total_qty DESC
     LIMIT ?`,
    [`-${days - 1} days`, limit],
  );
}

export type LowStockItem = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  stock_qty: number;
  unit: string;
};

export async function getLowStockItems(threshold = 5, limit = 50): Promise<LowStockItem[]> {
  const db = await getDb();
  return await db.select<LowStockItem[]>(
    `SELECT
       v.id AS variant_id,
       p.id AS product_id,
       p.name AS product_name,
       v.sku  AS sku,
       v.stock_qty,
       p.unit
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE p.is_archived = 0 AND v.stock_qty <= ?
     ORDER BY v.stock_qty ASC
     LIMIT ?`,
    [threshold, limit],
  );
}

export type RevenueByDay = {
  date: string;
  revenue: number;
  orders: number;
};

export async function getRevenueByDay(days: number): Promise<RevenueByDay[]> {
  const db = await getDb();
  return await db.select<RevenueByDay[]>(
    `SELECT
       date(created_at,'localtime') AS date,
       COALESCE(SUM(total), 0)       AS revenue,
       COUNT(*)                       AS orders
     FROM orders
     WHERE type='sale' AND status != 'cancelled'
       AND date(created_at,'localtime') >= date('now','localtime',?)
     GROUP BY date
     ORDER BY date DESC`,
    [`-${days - 1} days`],
  );
}

export type ProfitReport = {
  product_id: number;
  sku: string;
  name: string;
  qty_sold: number;
  revenue: number;
  cost_total: number;
  profit: number;
};

export async function getProfitByProduct(
  fromDate: string,
  toDate: string,
): Promise<ProfitReport[]> {
  const db = await getDb();
  return await db.select<ProfitReport[]>(
    `SELECT
       p.id           AS product_id,
       v.sku          AS sku,
       p.name         AS name,
       SUM(i.qty)             AS qty_sold,
       SUM(i.total)           AS revenue,
       SUM(i.qty * i.cost)    AS cost_total,
       SUM(i.total) - SUM(i.qty * i.cost) AS profit
     FROM order_items i
     JOIN orders o           ON o.id = i.order_id
     JOIN product_variants v ON v.id = i.variant_id
     JOIN products p         ON p.id = v.product_id
     WHERE o.type='sale' AND o.status != 'cancelled'
       AND date(o.created_at,'localtime') BETWEEN date(?) AND date(?)
     GROUP BY p.id
     ORDER BY profit DESC`,
    [fromDate, toDate],
  );
}

export type StockValuationRow = {
  variant_id: number;
  product_id: number;
  sku: string;
  name: string;
  unit: string;
  stock_qty: number;
  price_cost: number;
  value: number;
};

export async function getStockValuation(): Promise<StockValuationRow[]> {
  const db = await getDb();
  return await db.select<StockValuationRow[]>(
    `SELECT
       v.id   AS variant_id,
       p.id   AS product_id,
       v.sku  AS sku,
       p.name AS name,
       p.unit AS unit,
       v.stock_qty,
       COALESCE(v.price_cost, p.price_cost) AS price_cost,
       v.stock_qty * COALESCE(v.price_cost, p.price_cost) AS value
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE p.is_archived = 0
     ORDER BY value DESC`,
  );
}

export type DebtRow = {
  id: number;
  name: string;
  phone: string | null;
  debt_amount: number;
};

export async function getDebtList(kind: "customer" | "supplier"): Promise<DebtRow[]> {
  const db = await getDb();
  const table = kind === "customer" ? "customers" : "suppliers";
  return await db.select<DebtRow[]>(
    `SELECT id, name, phone, debt_amount
     FROM ${table}
     WHERE debt_amount > 0
     ORDER BY debt_amount DESC`,
  );
}
