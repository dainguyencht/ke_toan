import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
import { useCreateReturn, useOrdersByContact } from "@/hooks/useOrders";
import { loadOrderForEdit } from "@/db/orders";
import {
  cn,
  dateTimeLocalToDb,
  formatDate,
  formatNumber,
  formatVND,
  toDateTimeLocalValue,
} from "@/lib/utils";
import { effectivePriceCost, effectivePriceSell, listUnitsOfProduct } from "@/db/units";
import type { ProductWithStock } from "@/db/products";
import type { ProductUnit } from "@/domain/types";
import { toast } from "sonner";

export type ReturnKind = "from-customer" | "to-supplier";

type Line = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  base_price: number; // current sell (customer) hoặc cost (supplier) per base
  units: ProductUnit[];
  unit_id: number;
  qty: number;
  price: number;
  /** Khi liên kết với đơn gốc: SL tối đa được trả lại (= qty của đơn gốc) */
  max_qty?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ReturnKind;
  /** Tùy chọn: prefill KH/NCC khi mở từ OrderDetail. */
  initialContactId?: number | null;
  /** Tùy chọn: prefill đơn gốc (auto-prefill items). */
  initialSourceOrderId?: number | null;
};

export function ReturnForm({
  open,
  onOpenChange,
  kind,
  initialContactId,
  initialSourceOrderId,
}: Props) {
  const isFromCustomer = kind === "from-customer";
  const contactKind = isFromCustomer ? "customer" : "supplier";
  const sourceType = isFromCustomer ? "sale" : "purchase";

  const labels = {
    title: isFromCustomer ? "Phiếu trả hàng từ KH" : "Phiếu trả hàng cho NCC",
    contact: isFromCustomer ? "Khách hàng (KH)" : "Nhà cung cấp (NCC)",
    sourceOrder: isFromCustomer
      ? "Đơn bán gốc (tùy chọn)"
      : "Phiếu nhập gốc (tùy chọn)",
    paidLabel: isFromCustomer ? "Đã hoàn lại" : "Đã nhận lại",
    debtLabel: isFromCustomer ? "Còn nợ KH:" : "NCC còn nợ mình:",
    submit: isFromCustomer ? "Tạo phiếu trả từ KH" : "Tạo phiếu trả NCC",
  };

  const [contactId, setContactId] = useState<number | null>(null);
  const [sourceOrderId, setSourceOrderId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("0");
  const [note, setNote] = useState("");
  const [orderDate, setOrderDate] = useState(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [loadingSource, setLoadingSource] = useState(false);

  const create = useCreateReturn();
  const { data: contactOrders = [] } = useOrdersByContact(
    contactKind,
    contactId,
  );
  const sourceOrders = useMemo(
    () => contactOrders.filter((o) => o.type === sourceType),
    [contactOrders, sourceType],
  );

  const reset = () => {
    setContactId(null);
    setSourceOrderId(null);
    setLines([]);
    setPaid("0");
    setNote("");
    setOrderDate(toDateTimeLocalValue(new Date()));
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // Đổi contact → reset source order + lines (gọi qua handler để không
  // đụng auto-reset khi prefill từ props)
  const changeContact = (id: number | null) => {
    setContactId(id);
    setSourceOrderId(null);
    setLines([]);
  };

  // Prefill từ props khi mở dialog (vd từ OrderDetail → "Trả hàng")
  useEffect(() => {
    if (!open) return;
    if (initialContactId != null) setContactId(initialContactId);
    if (initialSourceOrderId != null) setSourceOrderId(initialSourceOrderId);
  }, [open, initialContactId, initialSourceOrderId]);

  // Khi chọn đơn gốc → prefill items
  useEffect(() => {
    if (!sourceOrderId) return;
    setLoadingSource(true);
    loadOrderForEdit(sourceOrderId)
      .then(({ lines: editLines }) => {
        setLines(
          editLines.map((l) => ({
            variant_id: l.variant_id,
            product_id: l.product_id,
            product_name: l.product_name,
            sku: l.sku,
            base_price: isFromCustomer ? l.base_price_sell : l.base_price_cost,
            units: l.units,
            unit_id: l.unit_id,
            qty: l.qty,
            price: l.price,
            max_qty: l.qty,
          })),
        );
      })
      .catch((err) => toast.error(`Lỗi load đơn: ${(err as Error).message}`))
      .finally(() => setLoadingSource(false));
  }, [sourceOrderId, isFromCustomer]);

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
    const basePrice = isFromCustomer ? p.price_sell : p.price_cost;
    setLines((prev) => [
      ...prev,
      {
        variant_id: p.default_variant_id!,
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        base_price: basePrice,
        units,
        unit_id: baseUnit.id,
        qty: 1,
        price: isFromCustomer
          ? effectivePriceSell(baseUnit, basePrice)
          : effectivePriceCost(baseUnit, basePrice),
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
      price: isFromCustomer
        ? effectivePriceSell(u, line.base_price)
        : effectivePriceCost(u, line.base_price),
    });
  };

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const paidNum = Number(paid) || 0;
  const debt = Math.max(0, subtotal - paidNum);

  // Cảnh báo SL trả > SL đơn gốc (nếu có link)
  const overReturned = lines.filter(
    (l) => l.max_qty != null && l.qty > l.max_qty,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId) {
      toast.error(`Phải chọn ${isFromCustomer ? "khách hàng" : "nhà cung cấp"}`);
      return;
    }
    if (lines.length === 0) {
      toast.error("Phải có ít nhất 1 dòng sản phẩm");
      return;
    }
    if (lines.some((l) => l.qty <= 0)) {
      toast.error("Số lượng các dòng phải > 0");
      return;
    }
    if (overReturned.length > 0) {
      const names = overReturned.map((l) => l.product_name).join(", ");
      if (!confirm(`SL trả vượt SL đơn gốc cho: ${names}. Vẫn tiếp tục?`)) return;
    }

    try {
      await create.mutateAsync({
        kind: contactKind,
        contact_id: contactId,
        source_order_id: sourceOrderId,
        note: note.trim() || null,
        paid: paidNum,
        created_at: dateTimeLocalToDb(orderDate),
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
      toast.success(
        isFromCustomer
          ? "Đã tạo phiếu trả hàng từ KH"
          : "Đã tạo phiếu trả hàng cho NCC",
      );
      handleClose(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label={labels.contact}>
              <ContactPicker
                kind={contactKind}
                value={contactId}
                onChange={changeContact}
              />
            </Field>
            <Field label="Ngày giờ phiếu">
              <Input
                type="datetime-local"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
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

          {contactId && (
            <Field label={labels.sourceOrder}>
              <select
                value={sourceOrderId ?? ""}
                onChange={(e) =>
                  setSourceOrderId(e.target.value ? Number(e.target.value) : null)
                }
                disabled={loadingSource}
                className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <option value="">— Không liên kết (chọn SP tự do) —</option>
                {sourceOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {formatDate(o.created_at)} · {formatVND(o.total)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-neutral-500 mt-1">
                Liên kết đơn gốc giúp prefill SP và giá đúng theo lúc mua/bán.
              </p>
            </Field>
          )}

          {!sourceOrderId && contactId && (
            <Field label="Thêm sản phẩm vào phiếu">
              <ProductPicker
                value={null}
                onChange={addProduct}
                excludeIds={lines.map((l) => l.product_id)}
              />
            </Field>
          )}

          <div className="border border-neutral-200 rounded-md max-h-[50vh] overflow-y-auto">
            {lines.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">
                {contactId
                  ? sourceOrderId
                    ? "Đang tải SP từ đơn gốc..."
                    : "Chưa có sản phẩm. Chọn từ danh sách trên hoặc liên kết đơn gốc."
                  : `Chọn ${isFromCustomer ? "khách hàng" : "nhà cung cấp"} để bắt đầu.`}
              </div>
            ) : (
              <Table>
                <THead className="sticky top-0 z-10">
                  <TR>
                    <TH>Mã sản phẩm</TH>
                    <TH>Tên sản phẩm</TH>
                    <TH className="w-24 text-right">SL trả</TH>
                    <TH className="w-56">ĐV / Quy đổi</TH>
                    <TH className="w-32 text-right">Đơn giá</TH>
                    <TH className="w-32 text-right">Thành tiền</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((l, idx) => {
                    const currentUnit = l.units.find((u) => u.id === l.unit_id);
                    const baseUnitName = l.units.find((u) => u.is_base)?.name ?? "";
                    const over = l.max_qty != null && l.qty > l.max_qty;
                    return (
                      <TR key={l.product_id}>
                        <TD className="font-mono text-xs">{l.sku}</TD>
                        <TD>
                          {l.product_name}
                          {l.max_qty != null && (
                            <div className="text-xs text-neutral-400">
                              SL đơn gốc: {formatNumber(l.max_qty)}
                            </div>
                          )}
                        </TD>
                        <TD>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(idx, { qty: Number(e.target.value) })
                            }
                            className={cn(
                              "text-right h-8",
                              over && "border-amber-500 ring-1 ring-amber-300",
                            )}
                          />
                          {over && (
                            <AlertTriangle
                              className="inline w-3.5 h-3.5 ml-1 text-amber-500"
                              aria-label="Vượt SL đơn gốc"
                            />
                          )}
                        </TD>
                        <TD>
                          <select
                            value={l.unit_id}
                            onChange={(e) => changeUnit(idx, Number(e.target.value))}
                            className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            {l.units.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                                {u.is_base ? " (cơ bản)" : ""}
                              </option>
                            ))}
                          </select>
                          {currentUnit && currentUnit.factor !== 1 && (
                            <div className="text-xs text-neutral-400 mt-0.5">
                              1 {currentUnit.name} = {currentUnit.factor}{" "}
                              {baseUnitName}
                            </div>
                          )}
                        </TD>
                        <TD>
                          <NumberInput
                            value={
                              currentUnit && currentUnit.factor > 0
                                ? Math.round(l.price / currentUnit.factor)
                                : l.price
                            }
                            onChange={(n) =>
                              updateLine(idx, {
                                price: n * (currentUnit?.factor ?? 1),
                              })
                            }
                            className="text-right h-8"
                          />
                          <div className="text-xs text-neutral-400 mt-0.5 text-right">
                            / {baseUnitName || currentUnit?.name}
                            {currentUnit && currentUnit.factor !== 1 && (
                              <span className="ml-1">
                                (= {formatVND(l.price)}/{currentUnit.name})
                              </span>
                            )}
                          </div>
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

          {overReturned.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {overReturned.length} sản phẩm có SL trả vượt SL đơn gốc.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 pt-2 border-t border-neutral-200">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Số dòng:</span>
                <span>{lines.length}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-medium text-base">
                <span>Tổng giá trị trả:</span>
                <span>{formatVND(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="shrink-0">{labels.paidLabel}:</Label>
                <NumberInput
                  value={paidNum}
                  onChange={(n) => setPaid(String(n))}
                  className="text-right max-w-40 h-8"
                />
              </div>
              {debt > 0 && (
                <div className="flex justify-between text-amber-600 font-medium">
                  <span>{labels.debtLabel}</span>
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
              {isFromCustomer ? "Hoàn đủ" : "Nhận đủ"}
            </Button>
            <Button type="submit" disabled={create.isPending || lines.length === 0}>
              {create.isPending ? "Đang lưu..." : labels.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
