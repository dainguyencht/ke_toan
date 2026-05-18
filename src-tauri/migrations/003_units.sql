-- Đơn vị tính của sản phẩm (giống KiotViet):
-- Mỗi SP có 1 đơn vị cơ bản (is_base=1, factor=1) và 0+ đơn vị quy đổi.
-- VD: gạch - cơ bản "m²", quy đổi "hộp" (1 hộp = 1.5 m² → factor=1.5).
-- Tồn kho LUÔN lưu theo đơn vị cơ bản.
CREATE TABLE product_units (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    factor      REAL    NOT NULL CHECK(factor > 0),  -- 1 unit = factor * base unit
    price_sell  REAL,                                 -- NULL = tính bằng product.price_sell * factor
    price_cost  REAL,                                 -- NULL = tính bằng product.price_cost * factor
    is_base     INTEGER NOT NULL DEFAULT 0,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_units_product ON product_units(product_id);
CREATE UNIQUE INDEX idx_units_product_name ON product_units(product_id, name);

-- Backfill: mỗi SP hiện có sinh 1 base unit từ products.unit
INSERT INTO product_units (product_id, name, factor, price_sell, price_cost, is_base, sort_order)
SELECT id, unit, 1.0, price_sell, price_cost, 1, 0 FROM products;

-- order_items: snapshot tên đơn vị + factor tại thời điểm đặt
-- (để báo cáo cũ không bị méo khi user đổi factor sau này)
ALTER TABLE order_items ADD COLUMN unit_name   TEXT;
ALTER TABLE order_items ADD COLUMN unit_factor REAL NOT NULL DEFAULT 1;

-- Backfill unit_name cho order_items đã có
UPDATE order_items SET unit_name = (
  SELECT p.unit FROM products p
  JOIN product_variants v ON v.product_id = p.id
  WHERE v.id = order_items.variant_id
)
WHERE unit_name IS NULL;
