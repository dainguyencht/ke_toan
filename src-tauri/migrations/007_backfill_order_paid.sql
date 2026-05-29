-- Backfill order.paid theo TỔNG cash flow thực tế của đơn (uncapped, khác
-- với cap-at-total ở createSale/Purchase trước đây).
-- Cho các đơn không cancelled:
--   sale         → SUM cash IN
--   purchase     → SUM cash OUT
--   return-from-customer (customer_id != NULL) → SUM cash OUT (refund out)
--   return-to-supplier   (supplier_id != NULL) → SUM cash IN (refund in)
-- Cancelled orders giữ nguyên để không ảnh hưởng audit.

UPDATE orders SET paid = COALESCE((
  SELECT SUM(amount)
  FROM cash_transactions
  WHERE ref_table = 'orders'
    AND ref_id = orders.id
    AND type = CASE
      WHEN orders.type = 'sale' THEN 'in'
      WHEN orders.type = 'purchase' THEN 'out'
      WHEN orders.type = 'return' AND orders.customer_id IS NOT NULL THEN 'out'
      WHEN orders.type = 'return' AND orders.supplier_id IS NOT NULL THEN 'in'
    END
), 0)
WHERE status != 'cancelled';

-- Cập nhật status: paid >= total → 'paid'; paid < total + đang 'paid' → 'delivered'
UPDATE orders SET status = 'paid'
WHERE status != 'cancelled' AND paid >= total;

UPDATE orders SET status = 'delivered'
WHERE status = 'paid' AND paid < total;
