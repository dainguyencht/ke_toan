-- Hình thức thanh toán của giao dịch sổ quỹ: tiền mặt hay chuyển khoản.
-- Mặc định 'cash' để mọi giao dịch cũ giữ nguyên ý nghĩa (trước đây app chỉ
-- có tiền mặt). User đổi lại được cho từng giao dịch trong Sổ quỹ.
ALTER TABLE cash_transactions
  ADD COLUMN method TEXT NOT NULL DEFAULT 'cash'
  CHECK(method IN ('cash','transfer'));

CREATE INDEX idx_cash_method ON cash_transactions(method);
