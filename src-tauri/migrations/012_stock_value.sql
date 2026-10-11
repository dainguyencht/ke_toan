-- Giá trị tồn kho (bể giá trị) của từng sản phẩm, đi kèm price_cost.
-- price_cost = stock_value / tổng tồn, nhưng KHÔNG suy ngược được giá trị từ
-- price_cost khi tồn bằng 0 hoặc âm - mà đó đúng là trạng thái trung gian khi
-- sửa phiếu nhập (huỷ phiếu cũ làm tồn tụt âm rồi tạo lại). Thiếu cột này thì
-- sửa chiết khấu phiếu nhập đã bán một phần sẽ lệch sổ.
ALTER TABLE products ADD COLUMN stock_value REAL NOT NULL DEFAULT 0;

-- Backfill: lấy tồn hiện tại × giá vốn hiện tại
UPDATE products SET stock_value = COALESCE((
  SELECT SUM(v.stock_qty) FROM product_variants v WHERE v.product_id = products.id
), 0) * COALESCE(price_cost, 0)
WHERE COALESCE((
  SELECT SUM(v.stock_qty) FROM product_variants v WHERE v.product_id = products.id
), 0) > 0;
