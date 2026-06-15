-- Phiếu điều chỉnh dư nợ (debt adjustment): cho phép user chỉnh tay dư nợ KH/NCC
-- (vd: nhập nợ ban đầu cho KH đã có nợ trước khi thêm vào app).
-- Mỗi lần chỉnh tạo 1 phiếu để giữ audit trail, hiện trong timeline KH/NCC.

CREATE TABLE debt_adjustments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,           -- DC-20260615-001
    kind            TEXT    NOT NULL CHECK(kind IN ('customer','supplier')),
    contact_id      INTEGER NOT NULL,
    old_debt        REAL    NOT NULL,
    new_debt        REAL    NOT NULL,
    change_amount   REAL    NOT NULL,                  -- new_debt - old_debt
    note            TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_debt_adj_contact ON debt_adjustments(kind, contact_id);
CREATE INDEX idx_debt_adj_created ON debt_adjustments(created_at);
