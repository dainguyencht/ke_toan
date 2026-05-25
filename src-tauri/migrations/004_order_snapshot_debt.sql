-- Snapshot công nợ của KH/NCC tại thời điểm TẠO phiếu.
-- Dùng để hiển thị "Nợ cũ" chính xác trong hoá đơn / OrderDetail, không bị
-- ảnh hưởng bởi các giao dịch phát sinh sau đó.
-- Phiếu cũ trước migration giữ giá trị 0 (chưa có snapshot, không hiển thị nợ cũ).
ALTER TABLE orders ADD COLUMN snapshot_debt REAL NOT NULL DEFAULT 0;
