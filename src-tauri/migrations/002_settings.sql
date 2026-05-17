CREATE TABLE app_settings (
    key        TEXT    PRIMARY KEY,
    value      TEXT,
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO app_settings (key, value) VALUES
    ('shop_name',           'Cửa hàng của tôi'),
    ('shop_address',        ''),
    ('shop_phone',          ''),
    ('low_stock_threshold', '5');
