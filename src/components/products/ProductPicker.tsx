import { cn, formatNumber } from "@/lib/utils";
import { useProducts } from "@/hooks/useProducts";
import type { ProductWithStock } from "@/db/products";

type Props = {
  value: number | null; // product id (KHÔNG phải variant_id)
  onChange: (product: ProductWithStock | null) => void;
  excludeIds?: number[];
  className?: string;
};

export function ProductPicker({ value, onChange, excludeIds = [], className }: Props) {
  const { data: products = [] } = useProducts("");
  const filtered = products.filter((p) => !excludeIds.includes(p.id));

  return (
    <select
      value={value == null ? "" : String(value)}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") {
          onChange(null);
          return;
        }
        const p = products.find((p) => p.id === Number(v)) ?? null;
        onChange(p);
      }}
      className={cn(
        "flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        className,
      )}
    >
      <option value="">-- Chọn sản phẩm --</option>
      {filtered.map((p) => (
        <option key={p.id} value={p.id}>
          {p.sku} · {p.name} (Tồn: {formatNumber(p.total_stock)})
        </option>
      ))}
    </select>
  );
}
