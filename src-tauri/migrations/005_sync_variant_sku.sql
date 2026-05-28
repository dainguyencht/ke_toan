-- Đồng bộ product_variants.sku theo products.sku cho các product chỉ có 1 variant.
-- Sửa bug data lệch trước v0.1.15: khi updateProduct chỉ update products.sku
-- mà không sync variants.sku → hoá đơn (join variants.sku) hiển thị SKU cũ.
-- Chỉ áp dụng cho product có duy nhất 1 variant (mặc định trong MVP).
UPDATE product_variants
SET sku = (
  SELECT p.sku FROM products p WHERE p.id = product_variants.product_id
)
WHERE product_id IN (
  SELECT product_id FROM product_variants GROUP BY product_id HAVING COUNT(*) = 1
);
