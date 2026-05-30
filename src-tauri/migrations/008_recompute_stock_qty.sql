-- Recompute stock_qty trên product_variants = SUM(qty_change) từ stock_movements.
-- stock_movements là source-of-truth theo design (xem comment migration 001).
-- Fix data lệch cache do bug edit-order với factor đã đổi sau khi tạo đơn.
UPDATE product_variants SET stock_qty = COALESCE((
  SELECT SUM(qty_change) FROM stock_movements
  WHERE stock_movements.variant_id = product_variants.id
), 0);
