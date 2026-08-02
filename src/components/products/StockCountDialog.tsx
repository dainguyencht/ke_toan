import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useStockAsOf, useBalanceStock } from "@/hooks/useProducts";
import type { StockCountRow } from "@/db/products";
import { formatNumber, toISODate } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Chuỗi người dùng gõ → số thực (nhận cả dấu `,` và `.`); rỗng = chưa đếm. */
function parseCount(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** attrs_json '{"size":"M"}' → 'M' để phân biệt biến thể; '{}' → ''. */
function attrsLabel(json: string): string {
  try {
    const o = JSON.parse(json) as Record<string, string>;
    const vals = Object.values(o).filter(Boolean);
    return vals.join(" / ");
  } catch {
    return "";
  }
}

export function StockCountDialog({ open, onOpenChange }: Props) {
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [search, setSearch] = useState("");
  // Bản đếm thực tế theo variant_id (giữ dạng chuỗi để cho gõ dở).
  const [counts, setCounts] = useState<Record<number, string>>({});

  const { data: rows, isLoading } = useStockAsOf(date, search, open);
  const balance = useBalanceStock();

  // Các dòng có lệch (đã đếm và khác tồn hệ thống).
  const changed = useMemo(() => {
    if (!rows) return [];
    return rows.flatMap((r) => {
      const c = parseCount(counts[r.variant_id]);
      if (c == null || c === r.system_stock) return [];
      return [{ row: r, counted: c }];
    });
  }, [rows, counts]);

  const handleBalance = async () => {
    if (!changed.length) {
      toast.info("Không có dòng nào lệch để cân bằng");
      return;
    }
    if (
      !confirm(
        `Cân bằng ${changed.length} sản phẩm về số thực tế (ghi điều chỉnh ngày ${date})?`,
      )
    )
      return;
    try {
      const n = await balance.mutateAsync({
        date,
        entries: changed.map((c) => ({
          variant_id: c.row.variant_id,
          system_stock: c.row.system_stock,
          counted: c.counted,
        })),
      });
      toast.success(`Đã cân bằng ${n} sản phẩm`);
      setCounts({});
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const renderDiff = (r: StockCountRow) => {
    const c = parseCount(counts[r.variant_id]);
    if (c == null) return <span className="text-neutral-300">-</span>;
    const diff = c - r.system_stock;
    if (diff === 0) return <span className="text-neutral-400">0</span>;
    return (
      <span className={diff > 0 ? "text-emerald-600" : "text-red-600"}>
        {diff > 0 ? "+" : ""}
        {formatNumber(diff)}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Kiểm kho</DialogTitle>
          <DialogDescription>
            Chọn ngày để xem tồn hệ thống tính đến cuối ngày đó, nhập số đếm thực
            tế, rồi cân bằng kho. Chênh lệch được ghi thành phiếu điều chỉnh.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-3 mb-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">
              Ngày kiểm
            </label>
            <Input
              type="date"
              value={date}
              max={toISODate(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo tên, mã sản phẩm, mã vạch..."
              className="pl-9"
            />
          </div>
        </div>

        <div className="border border-neutral-200 rounded-md max-h-[50vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-neutral-500">Đang tải...</div>
          ) : !rows?.length ? (
            <div className="p-8 text-center text-neutral-500">
              Không có sản phẩm nào.
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Mã</TH>
                  <TH>Tên sản phẩm</TH>
                  <TH className="text-right">Tồn hệ thống</TH>
                  <TH className="text-right w-32">SL thực tế</TH>
                  <TH className="text-right w-24">Lệch</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const attrs = attrsLabel(r.attrs_json);
                  return (
                    <TR key={r.variant_id}>
                      <TD className="font-mono text-xs">{r.sku}</TD>
                      <TD className="font-medium">
                        {r.product_name}
                        {attrs && (
                          <span className="text-neutral-400 font-normal">
                            {" "}
                            ({attrs})
                          </span>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums text-neutral-600">
                        {formatNumber(r.system_stock)} {r.base_unit}
                      </TD>
                      <TD className="text-right">
                        <Input
                          value={counts[r.variant_id] ?? ""}
                          onChange={(e) =>
                            setCounts((prev) => ({
                              ...prev,
                              [r.variant_id]: e.target.value,
                            }))
                          }
                          inputMode="decimal"
                          placeholder="-"
                          className="text-right h-8"
                        />
                      </TD>
                      <TD className="text-right tabular-nums font-medium">
                        {renderDiff(r)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </div>

        <DialogFooter className="items-center">
          <span className="mr-auto text-sm text-neutral-500">
            {changed.length > 0
              ? `${changed.length} sản phẩm lệch sẽ được cân bằng`
              : "Chưa có chênh lệch"}
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button
            onClick={handleBalance}
            disabled={!changed.length || balance.isPending}
          >
            Cân bằng kho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
