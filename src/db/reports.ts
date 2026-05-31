import { getDb } from "./client";

export type DashboardStats = {
  revenue_today: number;
  revenue_7d: number;
  orders_today: number;
  orders_7d: number;
  profit_today: number;
  profit_7d: number;
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
    profitTodayRows,
    profit7dRows,
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
    db.select<{ profit: number }[]>(
      `SELECT COALESCE(SUM(i.total) - SUM(i.qty * i.cost), 0) AS profit
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       WHERE o.type='sale' AND o.status != 'cancelled'
         AND date(o.created_at) = date('now','localtime')`,
    ),
    db.select<{ profit: number }[]>(
      `SELECT COALESCE(SUM(i.total) - SUM(i.qty * i.cost), 0) AS profit
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       WHERE o.type='sale' AND o.status != 'cancelled'
         AND date(o.created_at) >= date('now','localtime','-6 days')`,
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
    profit_today: profitTodayRows[0]?.profit ?? 0,
    profit_7d: profit7dRows[0]?.profit ?? 0,
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
  base_unit: string;
  total_qty: number; // theo đơn vị cơ bản
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
       p.unit AS base_unit,
       SUM(i.qty * COALESCE(i.unit_factor, 1)) AS total_qty,
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

export async function getRevenueByDay(
  fromDate: string,
  toDate: string,
): Promise<RevenueByDay[]> {
  const db = await getDb();
  return await db.select<RevenueByDay[]>(
    `SELECT
       date(created_at)              AS date,
       COALESCE(SUM(total), 0)       AS revenue,
       COUNT(*)                       AS orders
     FROM orders
     WHERE type='sale' AND status != 'cancelled'
       AND date(created_at) BETWEEN date(?) AND date(?)
     GROUP BY date
     ORDER BY date DESC`,
    [fromDate, toDate],
  );
}

export type RevenueTotal = {
  revenue: number;
  orders: number;
  first_order_date: string | null;
};

/** Tổng doanh thu tích lũy (từ trước đến giờ, bỏ qua đơn cancelled) */
export async function getRevenueTotal(): Promise<RevenueTotal> {
  const db = await getDb();
  const rows = await db.select<RevenueTotal[]>(
    `SELECT
       COALESCE(SUM(total), 0)        AS revenue,
       COUNT(*)                        AS orders,
       MIN(date(created_at))             AS first_order_date
     FROM orders
     WHERE type='sale' AND status != 'cancelled'`,
  );
  return rows[0] ?? { revenue: 0, orders: 0, first_order_date: null };
}

export type ProfitTotal = {
  revenue: number;
  cost: number;
  profit: number;
};

/** Lãi gộp tích lũy (từ trước đến giờ) — trừ hàng KH trả lại để khớp với P&L. */
export async function getProfitTotal(): Promise<ProfitTotal> {
  const db = await getDb();
  const rows = await db.select<ProfitTotal[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN o.type='sale' THEN  i.total
                         WHEN o.type='return' THEN -i.total
                         ELSE 0 END), 0) AS revenue,
       COALESCE(SUM(CASE WHEN o.type='sale' THEN  i.qty * i.cost
                         WHEN o.type='return' THEN -i.qty * i.cost
                         ELSE 0 END), 0) AS cost,
       COALESCE(SUM(CASE WHEN o.type='sale' THEN  i.total - i.qty * i.cost
                         WHEN o.type='return' THEN -(i.total - i.qty * i.cost)
                         ELSE 0 END), 0) AS profit
     FROM order_items i
     JOIN orders o ON o.id = i.order_id
     WHERE (o.type='sale' OR (o.type='return' AND o.customer_id IS NOT NULL))
       AND o.status != 'cancelled'`,
  );
  return rows[0] ?? { revenue: 0, cost: 0, profit: 0 };
}

export type ProfitReport = {
  product_id: number;
  sku: string;
  name: string;
  base_unit: string;
  qty_sold: number; // theo đơn vị cơ bản
  revenue: number;
  cost_total: number;
  profit: number;
};

export async function getProfitByProduct(
  fromDate: string,
  toDate: string,
): Promise<ProfitReport[]> {
  const db = await getDb();
  // Sale items: cộng dương. Return items (KH trả lại): trừ.
  // Cần qty/revenue/cost ròng theo từng SP để khớp với P&L.
  return await db.select<ProfitReport[]>(
    `SELECT
       p.id   AS product_id,
       v.sku  AS sku,
       p.name AS name,
       p.unit AS base_unit,
       SUM(CASE WHEN o.type='sale' THEN  i.qty * COALESCE(i.unit_factor, 1)
                WHEN o.type='return' THEN -i.qty * COALESCE(i.unit_factor, 1)
                ELSE 0 END) AS qty_sold,
       SUM(CASE WHEN o.type='sale' THEN  i.total
                WHEN o.type='return' THEN -i.total
                ELSE 0 END) AS revenue,
       SUM(CASE WHEN o.type='sale' THEN  i.qty * i.cost
                WHEN o.type='return' THEN -i.qty * i.cost
                ELSE 0 END) AS cost_total,
       SUM(CASE WHEN o.type='sale' THEN  i.total - i.qty * i.cost
                WHEN o.type='return' THEN -(i.total - i.qty * i.cost)
                ELSE 0 END) AS profit
     FROM order_items i
     JOIN orders o           ON o.id = i.order_id
     JOIN product_variants v ON v.id = i.variant_id
     JOIN products p         ON p.id = v.product_id
     WHERE (o.type='sale'
            OR (o.type='return' AND o.customer_id IS NOT NULL))
       AND o.status != 'cancelled'
       AND date(o.created_at) BETWEEN date(?) AND date(?)
     GROUP BY p.id
     HAVING qty_sold <> 0 OR revenue <> 0
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

export type CategoryAmount = { category: string; amount: number };

export type ProfitLossReport = {
  /** (1) Doanh thu bán hàng — tổng total đơn bán */
  revenue: number;
  /** Chiết khấu hoá đơn */
  discount: number;
  /** Giá trị hàng KH trả lại */
  returns_value: number;
  /** (2) Giảm trừ doanh thu = chiết khấu + hàng trả lại */
  deductions: number;
  /** (3) Doanh thu thuần */
  net_revenue: number;
  /** Giá vốn của đơn bán */
  cogs_sales: number;
  /** Giá vốn hàng trả lại */
  cogs_returns: number;
  /** (4) Giá vốn hàng bán = COGS bán − COGS hàng trả lại */
  cogs: number;
  /** (5) Lợi nhuận gộp = doanh thu thuần − giá vốn */
  gross_profit: number;
  /** (6) Chi phí — tổng phiếu chi nhập tay */
  expenses: number;
  /** Danh sách chi phí theo danh mục */
  expense_breakdown: CategoryAmount[];
  /** (7) Lợi nhuận từ hoạt động KD = gross profit − chi phí */
  operating_profit: number;
  /** (8) Thu nhập khác — tổng phiếu thu nhập tay */
  other_income: number;
  /** Danh sách thu nhập khác theo danh mục */
  other_income_breakdown: CategoryAmount[];
  /** (9) Lợi nhuận thuần = operating profit + thu nhập khác */
  net_profit: number;
};

export async function getProfitLoss(
  fromDate: string,
  toDate: string,
): Promise<ProfitLossReport> {
  const db = await getDb();
  const params = [fromDate, toDate];
  const [
    saleRows,
    saleCogsRows,
    returnsRows,
    returnsCogsRows,
    expenseRows,
    incomeRows,
  ] = await Promise.all([
    db.select<{ revenue: number; discount: number }[]>(
      `SELECT
         COALESCE(SUM(total), 0)    AS revenue,
         COALESCE(SUM(discount), 0) AS discount
       FROM orders
       WHERE type='sale' AND status != 'cancelled'
         AND date(created_at) BETWEEN date(?) AND date(?)`,
      params,
    ),
    db.select<{ cogs: number }[]>(
      `SELECT COALESCE(SUM(i.qty * i.cost), 0) AS cogs
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       WHERE o.type='sale' AND o.status != 'cancelled'
         AND date(o.created_at) BETWEEN date(?) AND date(?)`,
      params,
    ),
    db.select<{ value: number }[]>(
      `SELECT COALESCE(SUM(total), 0) AS value
       FROM orders
       WHERE type='return' AND status != 'cancelled'
         AND customer_id IS NOT NULL
         AND date(created_at) BETWEEN date(?) AND date(?)`,
      params,
    ),
    db.select<{ cogs: number }[]>(
      `SELECT COALESCE(SUM(i.qty * i.cost), 0) AS cogs
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       WHERE o.type='return' AND o.status != 'cancelled'
         AND o.customer_id IS NOT NULL
         AND date(o.created_at) BETWEEN date(?) AND date(?)`,
      params,
    ),
    db.select<CategoryAmount[]>(
      `SELECT
         COALESCE(NULLIF(category, ''), '(không danh mục)') AS category,
         SUM(amount) AS amount
       FROM cash_transactions
       WHERE type='out' AND ref_table IS NULL
         AND date(created_at) BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY amount DESC`,
      params,
    ),
    db.select<CategoryAmount[]>(
      `SELECT
         COALESCE(NULLIF(category, ''), '(không danh mục)') AS category,
         SUM(amount) AS amount
       FROM cash_transactions
       WHERE type='in' AND ref_table IS NULL
         AND date(created_at) BETWEEN date(?) AND date(?)
       GROUP BY category
       ORDER BY amount DESC`,
      params,
    ),
  ]);

  const revenue = saleRows[0]?.revenue ?? 0;
  const discount = saleRows[0]?.discount ?? 0;
  const returns_value = returnsRows[0]?.value ?? 0;
  const deductions = discount + returns_value;
  const net_revenue = revenue - deductions;
  const cogs_sales = saleCogsRows[0]?.cogs ?? 0;
  const cogs_returns = returnsCogsRows[0]?.cogs ?? 0;
  const cogs = cogs_sales - cogs_returns;
  const gross_profit = net_revenue - cogs;
  const expenses = expenseRows.reduce((s, r) => s + r.amount, 0);
  const operating_profit = gross_profit - expenses;
  const other_income = incomeRows.reduce((s, r) => s + r.amount, 0);
  const net_profit = operating_profit + other_income;

  return {
    revenue,
    discount,
    returns_value,
    deductions,
    net_revenue,
    cogs_sales,
    cogs_returns,
    cogs,
    gross_profit,
    expenses,
    expense_breakdown: expenseRows,
    operating_profit,
    other_income,
    other_income_breakdown: incomeRows,
    net_profit,
  };
}
