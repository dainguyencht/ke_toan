-- Nhật ký mỗi lần tính lại giá vốn (backfill sau nâng cấp hoặc bấm tay).
-- Lưu giá trị TRƯỚC/SAU để truy lại "SP này trước đây giá vốn bao nhiêu"
-- và khôi phục tay nếu cần. Chỉ ghi dòng có thay đổi.
CREATE TABLE cost_backfill_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT    NOT NULL,              -- gom các dòng của cùng 1 lần chạy
    reason          TEXT    NOT NULL,              -- 'upgrade' | 'manual'
    product_id      INTEGER NOT NULL,
    old_price_cost  REAL    NOT NULL,
    old_stock_value REAL    NOT NULL,
    new_price_cost  REAL    NOT NULL,
    new_stock_value REAL    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_cost_log_run     ON cost_backfill_log(run_id);
CREATE INDEX idx_cost_log_product ON cost_backfill_log(product_id);
