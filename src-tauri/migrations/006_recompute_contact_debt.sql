-- Recompute debt_amount cho mọi customer + supplier dựa trên tổng timeline:
--   debt = SUM(orders: +total nếu sale/purchase, -total nếu return)
--        + SUM(cash:   customer kind: -amount nếu in, +amount nếu out
--                      supplier kind: -amount nếu out, +amount nếu in)
-- Fix data lệch do bug edge case (overpay-cancel, version cũ trước v0.1.14...).

UPDATE customers SET debt_amount =
  COALESCE((
    SELECT SUM(CASE WHEN o.type = 'return' THEN -o.total ELSE o.total END)
    FROM orders o
    WHERE o.customer_id = customers.id AND o.status != 'cancelled'
  ), 0)
  +
  COALESCE((
    SELECT SUM(CASE WHEN ct.type = 'in' THEN -ct.amount ELSE ct.amount END)
    FROM cash_transactions ct
    WHERE (ct.ref_table = 'customers' AND ct.ref_id = customers.id)
       OR (ct.ref_table = 'orders' AND ct.ref_id IN (
             SELECT id FROM orders
             WHERE customer_id = customers.id AND status != 'cancelled'
           ))
  ), 0);

UPDATE suppliers SET debt_amount =
  COALESCE((
    SELECT SUM(CASE WHEN o.type = 'return' THEN -o.total ELSE o.total END)
    FROM orders o
    WHERE o.supplier_id = suppliers.id AND o.status != 'cancelled'
  ), 0)
  +
  COALESCE((
    SELECT SUM(CASE WHEN ct.type = 'out' THEN -ct.amount ELSE ct.amount END)
    FROM cash_transactions ct
    WHERE (ct.ref_table = 'suppliers' AND ct.ref_id = suppliers.id)
       OR (ct.ref_table = 'orders' AND ct.ref_id IN (
             SELECT id FROM orders
             WHERE supplier_id = suppliers.id AND status != 'cancelled'
           ))
  ), 0);
