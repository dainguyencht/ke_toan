-- Bật ràng buộc khóa ngoại cho mỗi kết nối (an toàn hơn)
PRAGMA foreign_keys = ON;

CREATE TABLE categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sku             TEXT    NOT NULL UNIQUE,
    name            TEXT    NOT NULL,
    barcode         TEXT,
    unit            TEXT    NOT NULL DEFAULT 'cái',
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    price_sell      REAL    NOT NULL DEFAULT 0,
    price_cost      REAL    NOT NULL DEFAULT 0,
    image_path      TEXT,
    note            TEXT,
    is_archived     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_name    ON products(name);

CREATE TABLE product_variants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku         TEXT    NOT NULL UNIQUE,
    attrs_json  TEXT    NOT NULL DEFAULT '{}',  -- {"size":"M","color":"đỏ"}
    price_sell  REAL,                            -- NULL = dùng giá của product
    price_cost  REAL,
    stock_qty   REAL    NOT NULL DEFAULT 0,      -- cache, có thể rebuild từ stock_movements
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    phone           TEXT,
    address         TEXT,
    debt_amount     REAL    NOT NULL DEFAULT 0,
    note            TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customers_name  ON customers(name);

CREATE TABLE suppliers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    phone           TEXT,
    address         TEXT,
    debt_amount     REAL    NOT NULL DEFAULT 0,
    note            TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Đơn hàng: bán hoặc trả hàng, hoặc phiếu nhập từ NCC
CREATE TABLE orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,  -- VD: ĐH-20260517-001
    type            TEXT    NOT NULL CHECK(type IN ('sale','return','purchase')),
    customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    subtotal        REAL    NOT NULL DEFAULT 0,
    discount        REAL    NOT NULL DEFAULT 0,
    total           REAL    NOT NULL DEFAULT 0,
    paid            REAL    NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','confirmed','delivered','paid','cancelled')),
    note            TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_status  ON orders(status);
CREATE INDEX idx_orders_type    ON orders(type);

CREATE TABLE order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    qty         REAL    NOT NULL,
    price       REAL    NOT NULL,           -- giá tại thời điểm chốt
    cost        REAL    NOT NULL DEFAULT 0, -- giá vốn tại thời điểm chốt (tính lãi)
    discount    REAL    NOT NULL DEFAULT 0,
    total       REAL    NOT NULL            -- qty * price - discount
);
CREATE INDEX idx_items_order   ON order_items(order_id);
CREATE INDEX idx_items_variant ON order_items(variant_id);

-- Source of truth cho tồn kho. Cộng dồn để ra stock_qty.
CREATE TABLE stock_movements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id  INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    qty_change  REAL    NOT NULL,           -- dương = nhập, âm = xuất
    type        TEXT    NOT NULL CHECK(type IN ('purchase','sale','return','adjust','init')),
    ref_table   TEXT,                        -- 'orders' nếu có ràng buộc
    ref_id      INTEGER,
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_movements_variant ON stock_movements(variant_id);
CREATE INDEX idx_movements_created ON stock_movements(created_at);

-- Sổ quỹ tiền mặt
CREATE TABLE cash_transactions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL CHECK(type IN ('in','out')),
    amount      REAL    NOT NULL,
    category    TEXT,                        -- 'thu bán hàng','trả NCC','tiền điện',...
    ref_table   TEXT,
    ref_id      INTEGER,
    note        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cash_created ON cash_transactions(created_at);
