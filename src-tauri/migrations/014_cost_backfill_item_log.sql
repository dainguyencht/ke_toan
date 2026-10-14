-- Nhật ký giá vốn TỪNG DÒNG PHIẾU mỗi lần tính lại (cost_backfill_log chỉ có
-- mức sản phẩm). Cần để báo cáo "lãi gộp theo tháng trước / sau khi tính lại".
CREATE TABLE cost_backfill_item_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id         TEXT    NOT NULL,
    order_item_id  INTEGER NOT NULL,
    old_cost       REAL    NOT NULL,
    new_cost       REAL    NOT NULL
);
CREATE INDEX idx_cost_item_log_run ON cost_backfill_item_log(run_id);
