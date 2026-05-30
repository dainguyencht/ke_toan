import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import { useProducts } from "@/hooks/useProducts";
import type { ProductWithStock } from "@/db/products";

type Props = {
  value: number | null;
  onChange: (product: ProductWithStock | null) => void;
  excludeIds?: number[];
  className?: string;
};

export function ProductPicker({ onChange, excludeIds = [], className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data: products = [] } = useProducts(query);
  const filtered = products
    .filter((p) => !excludeIds.includes(p.id))
    .slice(0, 50);

  const handleSelect = (p: ProductWithStock) => {
    onChange(p);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Tìm sản phẩm theo tên, mã SP, mã vạch..."
        className="pl-9"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg">
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(p)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0 flex items-center justify-between gap-3"
            >
              <span className="flex-1 min-w-0">
                <span className="font-mono text-xs text-neutral-500">{p.sku}</span>
                <span className="ml-2 text-neutral-800">{p.name}</span>
              </span>
              <span className="text-xs text-neutral-500 shrink-0">
                Tồn: {formatNumber(p.total_stock)}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute z-50 left-0 right-0 mt-1 rounded-md border border-neutral-200 bg-white shadow-lg px-3 py-2 text-sm text-neutral-500">
          Không tìm thấy sản phẩm khớp "{query}"
        </div>
      )}
    </div>
  );
}
