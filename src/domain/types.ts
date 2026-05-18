export type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  created_at: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  barcode: string | null;
  unit: string;
  category_id: number | null;
  price_sell: number;
  price_cost: number;
  image_path: string | null;
  note: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

export type ProductVariant = {
  id: number;
  product_id: number;
  sku: string;
  attrs_json: string;
  price_sell: number | null;
  price_cost: number | null;
  stock_qty: number;
  created_at: string;
};

export type ProductUnit = {
  id: number;
  product_id: number;
  name: string;
  factor: number;          // 1 unit_này = factor * base_unit
  price_sell: number | null; // null = product.price_sell * factor
  price_cost: number | null; // null = product.price_cost * factor
  is_base: number;          // 1 = đơn vị cơ bản
  sort_order: number;
  created_at: string;
};

export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  debt_amount: number;
  note: string | null;
  created_at: string;
};

export type Supplier = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  debt_amount: number;
  note: string | null;
  created_at: string;
};

export type OrderType = "sale" | "return" | "purchase";
export type OrderStatus = "draft" | "confirmed" | "delivered" | "paid" | "cancelled";

export type Order = {
  id: number;
  code: string;
  type: OrderType;
  customer_id: number | null;
  supplier_id: number | null;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  status: OrderStatus;
  note: string | null;
  created_at: string;
};

export type OrderItem = {
  id: number;
  order_id: number;
  variant_id: number;
  qty: number;          // theo đơn vị bán (unit_name)
  price: number;        // giá đơn vị bán
  cost: number;         // giá vốn đơn vị bán (snapshot)
  discount: number;
  total: number;
  unit_name: string;    // 'm²' / 'hộp' / 'thùng'... snapshot
  unit_factor: number;  // 1 unit_name = factor * base_unit
};

export type StockMovementType = "purchase" | "sale" | "return" | "adjust" | "init";

export type StockMovement = {
  id: number;
  variant_id: number;
  qty_change: number;
  type: StockMovementType;
  ref_table: string | null;
  ref_id: number | null;
  note: string | null;
  created_at: string;
};

export type CashTransaction = {
  id: number;
  type: "in" | "out";
  amount: number;
  category: string | null;
  ref_table: string | null;
  ref_id: number | null;
  note: string | null;
  created_at: string;
};
