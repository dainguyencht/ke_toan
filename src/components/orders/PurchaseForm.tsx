import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { ProductPicker } from "@/components/products/ProductPicker";
import { useCreatePurchase } from "@/hooks/useOrders";
import { formatVND, formatNumber, cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ProductWithStock } from "@/db/products";
import type { ProductUnit } from "@/domain/types";
import {
  effectivePriceCost,
  listUnitsOfProduct,
} from "@/db/units";

type Line = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  base_price_cost: number;
  units: ProductUnit[];
  unit_id: number;
  qty: number;
  price: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function PurchaseForm({ open, onOpenChange }: Props) {
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("0");
  const [note, setNote] = useState("");

  const create = useCreatePurchase();

  const reset = () => {
    setSupplierId(null);
    setLines([]);
    setPaid("0");
    setNote("");
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const addProduct = async (p: ProductWithStock | null) => {
    if (!p || !p.default_variant_id) return;
    if (lines.some((l) => l.product_id === p.id)) {
      toast.info("Sản phẩm đã có trong phiếu");
      return;
    }
    const units = await listUnitsOfProduct(p.id);
    const baseUnit = units.find((u) => u.is_base) ?? units[0];
    if (!baseUnit) {
      toast.error("Sản phẩm chưa có đơn vị nào");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        variant_id: p.default_variant_id!,
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        base_price_cost: p.price_cost,
        units,
        unit_id: baseUnit.id,
        qty: 1,
        price: effectivePriceCost(baseUnit, p.price_cost),
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const changeUnit = (idx: number, unitId: number) => {
    const line = lines[idx];
    const u = line.units.find((x) => x.id === unitId);
    if (!u) return;
    updateLine(idx, {
      unit_id: unitId,
      price: effectivePriceCost(u, line.base_price_cost),
    });
  };

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const paidNum = Number(paid) || 0;
  const debt = Math.max(0, subtotal - paidNum);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error("Phải có ít nhất 1 dòng sản phẩm");
      return;
    }
    if (lines.some((l) => l.qty <= 0)) {
      toast.error("Số lượng các dòng phải > 0");
      return;
    }
    if (debt > 0 && !supplierId) {
      toast.error("Có công nợ nhưng chưa chọn NCC. Hoặc chọn NCC, hoặc trả đủ.");
      return;
    }
    try {
      await create.mutateAsync({
        supplier_id: supplierId,
        note: note.trim() || null,
        paid: paidNum,
        items: lines.map((l) => {
          const u = l.units.find((x) => x.id === l.unit_id)!;
          return {
            variant_id: l.variant_id,
            product_name: l.product_name,
            qty: l.qty,
            price: l.price,
            unit_name: u.name,
            unit_factor: u.factor,
          };
        }),
      });
      toast.success("Đã tạo phiếu nhập");
      handleClose(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Tạo phiếu nhập kho</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nhà cung cấp (NCC)">
              <ContactPicker
                kind="supplier"
                value={supplierId}
                onChange={setSupplierId}
              />
            </Field>
            <Field label="Ghi chú">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Tùy chọn"
              />
            </Field>
          </div>

          <Field label="Thêm sản phẩm vào phiếu">
            <ProductPicker
              value={null}
              onChange={addProduct}
              excludeIds={lines.map((l) => l.product_id)}
            />
          </Field>

          <div className="border border-neutral-200 rounded-md">
            {lines.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">
                Chưa có sản phẩm. Chọn từ danh sách trên.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Mã sản phẩm</TH>
                    <TH>Tên sản phẩm</TH>
                    <TH className="w-20 text-right">SL</TH>
                    <TH className="w-14">ĐV</TH>
                    <TH className="w-56">Quy đổi</TH>
                    <TH className="w-32 text-right">Đơn giá nhập</TH>
                    <TH className="w-32 text-right">Thành tiền</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((l, idx) => {
                    const currentUnit = l.units.find((u) => u.id === l.unit_id);
                    const baseUnitName = l.units.find((u) => u.is_base)?.name ?? "";
                    const qtyBase = l.qty * (currentUnit?.factor ?? 1);
                    return (
                      <TR key={l.product_id}>
                        <TD className="font-mono text-xs">{l.sku}</TD>
                        <TD>{l.product_name}</TD>
                        <TD className="text-right tabular-nums font-medium">
                          {formatNumber(qtyBase)}
                        </TD>
                        <TD className="text-neutral-600">{baseUnitName}</TD>
                        <TD>
                          <div className="flex gap-1">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={l.qty}
                              onChange={(e) =>
                                updateLine(idx, { qty: Number(e.target.value) })
                              }
                              className="text-right h-8 flex-1 min-w-0"
                            />
                            <div className="w-28 shrink-0">
                              <UnitSelect
                                units={l.units}
                                value={l.unit_id}
                                onChange={(v) => changeUnit(idx, v)}
                              />
                            </div>
                          </div>
                          {currentUnit && currentUnit.factor !== 1 && (
                            <div className="text-xs text-neutral-400 mt-0.5">
                              1 {currentUnit.name} = {currentUnit.factor}{" "}
                              {baseUnitName}
                            </div>
                          )}
                        </TD>
                        <TD>
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={l.price}
                            onChange={(e) =>
                              updateLine(idx, { price: Number(e.target.value) })
                            }
                            className="text-right h-8"
                          />
                          {currentUnit && (
                            <div className="text-xs text-neutral-400 mt-0.5 text-right">
                              / {currentUnit.name}
                              {currentUnit.factor !== 1 && (
                                <span className="ml-1">
                                  (= {formatVND(l.price / currentUnit.factor)}/
                                  {baseUnitName})
                                </span>
                              )}
                            </div>
                          )}
                        </TD>
                        <TD className="text-right font-medium tabular-nums">
                          {formatVND(l.qty * l.price)}
                        </TD>
                        <TD>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() => removeLine(idx)}
                            title="Xóa dòng"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6 pt-2 border-t border-neutral-200">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Số dòng:</span>
                <span>{lines.length}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-medium text-base">
                <span>Tổng tiền:</span>
                <span>{formatVND(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="shrink-0">Đã trả:</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                  className="text-right max-w-40 h-8"
                />
              </div>
              {debt > 0 && (
                <div className="flex justify-between text-amber-600 font-medium">
                  <span>Công nợ phải trả:</span>
                  <span>{formatVND(debt)}</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPaid(String(subtotal))}
              disabled={subtotal === 0}
            >
              Trả đủ
            </Button>
            <Button type="submit" disabled={create.isPending || lines.length === 0}>
              {create.isPending ? "Đang lưu..." : "Tạo phiếu nhập"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UnitSelect({
  units,
  value,
  onChange,
}: {
  units: ProductUnit[];
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cn(
        "h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
      )}
    >
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
          {u.is_base ? " (cơ bản)" : ""}
        </option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
