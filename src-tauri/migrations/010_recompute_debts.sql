-- Recompute lại debt_amount cho tất cả KH/NCC, gộp orders + cash + adjustments.
-- Fix data cũ bị lệch do bug: trước v0.1.32, recomputeAndSetContactDebt bỏ qua
-- debt_adjustments → user adjust debt rồi tạo phiếu sau đó thì contact.debt_amount
-- bị reset, không gồm adjustment.
--
-- Công thức: SUM(orders.total signed by type) + SUM(cash signed by type & kind) +
--   SUM(debt_adjustments.change_amount)

UPDATE customers SET debt_amount = (
  COALESCE((
    SELECT SUM(CASE WHEN type='return' THEN -total ELSE total END)
    FROM orders
    WHERE customer_id = customers.id AND status != 'cancelled'
  ), 0)
  + COALESCE((
    SELECT SUM(CASE WHEN type='in' THEN -amount ELSE amount END)
    FROM cash_transactions
    WHERE (ref_table = 'customers' AND ref_id = customers.id)
       OR (ref_table = 'orders' AND ref_id IN (
            SELECT id FROM orders WHERE customer_id = customers.id AND status != 'cancelled'
          ))
  ), 0)
  + COALESCE((
    SELECT SUM(change_amount) FROM debt_adjustments
    WHERE kind = 'customer' AND contact_id = customers.id
  ), 0)
);

UPDATE suppliers SET debt_amount = (
  COALESCE((
    SELECT SUM(CASE WHEN type='return' THEN -total ELSE total END)
    FROM orders
    WHERE supplier_id = suppliers.id AND status != 'cancelled'
  ), 0)
  + COALESCE((
    SELECT SUM(CASE WHEN type='out' THEN -amount ELSE amount END)
    FROM cash_transactions
    WHERE (ref_table = 'suppliers' AND ref_id = suppliers.id)
       OR (ref_table = 'orders' AND ref_id IN (
            SELECT id FROM orders WHERE supplier_id = suppliers.id AND status != 'cancelled'
          ))
  ), 0)
  + COALESCE((
    SELECT SUM(change_amount) FROM debt_adjustments
    WHERE kind = 'supplier' AND contact_id = suppliers.id
  ), 0)
);
