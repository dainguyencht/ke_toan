import { useEffect, useState } from "react";
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
import { useCancelOrder, useCreateSale } from "@/hooks/useOrders";
import { useContact } from "@/hooks/useContacts";
import { loadOrderForEdit } from "@/db/orders";
import {
  cn,
  dateTimeLocalToDb,
  formatNumber,
  formatVND,
  toDateTimeLocalValue,
} from "@/lib/utils";
import { toast } from "sonner";
import type { ProductWithStock } from "@/db/products";
import type { ProductUnit } from "@/domain/types";
import { effectivePriceSell, listUnitsOfProduct } from "@/db/units";

type Line = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  base_price_sell: number;
  units: ProductUnit[];
  unit_id: number;
  qty: number;
  price: number;
  available_base: number; // tồn theo base unit (snapshot lúc thêm)
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Khi truyền: load đơn cũ, edit, submit sẽ hủy + tạo mới. */
  editOrderId?: number;
  /** Gọi khi tạo/cập nhật thành công, kèm id của phiếu mới. */
  onSuccess?: (orderId: number) => void;
};

export function SaleForm({ open, onOpenChange, editOrderId, onSuccess }: Props) {
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("0");
  const [note, setNote] = useState("");
  const [orderDate, setOrderDate] = useState(() =>
    toDateTimeLocalValue(new Date()),
  );
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);

  const create = useCreateSale();
  const cancel = useCancelOrder();
  const { data: customerData } = useContact("customer", customerId);
  const oldDebt = customerData?.debt_amount ?? 0;
  const isEdit = editOrderId != null;

  const reset = () => {
    setCustomerId(null);
    setLines([]);
    setPaid("0");
    setNote("");
    setOrderDate(toDateTimeLocalValue(new Date()));
    setEditingCode(null);
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  useEffect(() => {
    if (!open || !editOrderId) return;
    setLoadingEdit(true);
    loadOrderForEdit(editOrderId)
      .then(({ order, lines: editLines }) => {
        setEditingCode(order.code);
        setCustomerId(order.customer_id);
        setPaid(String(order.paid));
        setNote(order.note ?? "");
        setOrderDate(toDateTimeLocalValue(order.created_at));
        setLines(
          editLines.map((l) => ({
            variant_id: l.variant_id,
            product_id: l.product_id,
            product_name: l.product_name,
            sku: l.sku,
            base_price_sell: l.base_price_sell,
            units: l.units,
            unit_id: l.unit_id,
            qty: l.qty,
            price: l.price,
            // Tồn hiện tại đã trừ đi qty của chính phiếu này → cộng lại
            // để user thấy tồn "khả dụng" đúng nếu cập nhật phiếu này:
            available_base:
              l.stock_base + l.qty * (l.units.find((u) => u.id === l.unit_id)?.factor ?? 1),
          })),
        );
      })
      .catch((err) => {
        toast.error(`Lỗi load đơn: ${(err as Error).message}`);
        handleClose(false);
      })
      .finally(() => setLoadingEdit(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editOrderId]);

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
        base_price_sell: p.price_sell,
        units,
        unit_id: baseUnit.id,
        qty: 1,
        price: effectivePriceSell(baseUnit, p.price_sell),
        available_base: p.total_stock,
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
      price: effectivePriceSell(u, line.base_price_sell),
    });
  };

  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const paidNum = Number(paid) || 0;
  // Tổng nợ sau giao dịch: oldDebt + (subtotal - paid).
  // > 0: KH còn nợ; < 0: KH dư tiền (mình nợ KH).
  const newDebt = oldDebt + subtotal - paidNum;

  // Tính oversold: convert qty về base unit để so với tồn
  const oversold = lines.filter((l) => {
    const u = l.units.find((x) => x.id === l.unit_id);
    if (!u) return false;
    return l.qty * u.factor > l.available_base;
  });

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
    if (oversold.length > 0) {
      const names = oversold.map((l) => l.product_name).join(", ");
      if (!confirm(`Tồn không đủ cho: ${names}. Vẫn tiếp tục bán âm tồn?`)) return;
    }
    if (paidNum < subtotal && !customerId) {
      toast.error("Có công nợ nhưng chưa chọn khách. Hoặc chọn KH, hoặc thu đủ.");
      return;
    }
    if (paidNum > subtotal && !customerId) {
      toast.error(
        "Thu nhiều hơn tổng đơn cần chọn KH (để trừ vào nợ cũ). Hoặc thu đúng = tổng.",
      );
      return;
    }

    const itemsPayload = lines.map((l) => {
      const u = l.units.find((x) => x.id === l.unit_id)!;
      return {
        variant_id: l.variant_id,
        product_name: l.product_name,
        qty: l.qty,
        price: l.price,
        unit_name: u.name,
        unit_factor: u.factor,
      };
    });

    if (isEdit && editOrderId && editingCode) {
      const ok = confirm(
        `Cập nhật phiếu ${editingCode}\n\n` +
          `• Phiếu cũ ${editingCode} sẽ bị HỦY (tồn/sổ quỹ/công nợ đảo ngược)\n` +
          `• Một PHIẾU MỚI sẽ được tạo với dữ liệu vừa sửa\n` +
          `• Phiếu mới có MÃ MỚI khác phiếu cũ\n\n` +
          `Tiếp tục?`,
      );
      if (!ok) return;
      try {
        await cancel.mutateAsync(editOrderId);
        const newId = await create.mutateAsync({
          customer_id: customerId,
          note: note.trim() || null,
          paid: paidNum,
          items: itemsPayload,
          created_at: dateTimeLocalToDb(orderDate),
        });
        toast.success(`Đã cập nhật. Phiếu cũ ${editingCode} đã hủy, phiếu mới đã tạo.`);
        handleClose(false);
        onSuccess?.(newId);
      } catch (err) {
        toast.error(`Lỗi cập nhật: ${(err as Error).message}`);
      }
      return;
    }

    try {
      const newId = await create.mutateAsync({
        customer_id: customerId,
        note: note.trim() || null,
        paid: paidNum,
        items: itemsPayload,
        created_at: dateTimeLocalToDb(orderDate),
      });
      toast.success("Đã tạo phiếu bán");
      handleClose(false);
      onSuccess?.(newId);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Cập nhật phiếu bán ${editingCode ?? "..."}` : "Tạo phiếu bán"}
          </DialogTitle>
        </DialogHeader>
        {loadingEdit && (
          <div className="text-sm text-neutral-500">Đang tải dữ liệu phiếu...</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Khách hàng (KH)">
              <ContactPicker
                kind="customer"
                value={customerId}
                onChange={setCustomerId}
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

          <Field label="Thêm sản phẩm vào phiếu">
            <ProductPicker
              value={null}
              onChange={addProduct}
              excludeIds={lines.map((l) => l.product_id)}
            />
          </Field>

          <div className="border border-neutral-200 rounded-md max-h-[50vh] overflow-y-auto">
            {lines.length === 0 ? (
              <div className="p-8 text-center text-neutral-400 text-sm">
                Chưa có sản phẩm. Chọn từ danh sách trên.
              </div>
            ) : (
              <Table>
                <THead className="sticky top-0 z-10">
                  <TR>
                    <TH>Mã sản phẩm</TH>
                    <TH>Tên sản phẩm</TH>
                    <TH className="w-20 text-right">Tồn</TH>
                    <TH className="w-20 text-right">SL</TH>
                    <TH className="w-14">ĐV</TH>
                    <TH className="w-56">Quy đổi</TH>
                    <TH className="w-32 text-right">Đơn giá bán</TH>
                    <TH className="w-32 text-right">Thành tiền</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((l, idx) => {
                    const currentUnit = l.units.find((u) => u.id === l.unit_id);
                    const baseUnitName = l.units.find((u) => u.is_base)?.name ?? "";
                    const qtyBase = l.qty * (currentUnit?.factor ?? 1);
                    const over = qtyBase > l.available_base;
                    return (
                      <TR key={l.product_id}>
                        <TD className="font-mono text-xs">{l.sku}</TD>
                        <TD>{l.product_name}</TD>
                        <TD className="text-right text-neutral-500 tabular-nums">
                          {formatNumber(l.available_base)}
                        </TD>
                        <TD
                          className={cn(
                            "text-right tabular-nums font-medium",
                            over && "text-amber-700",
                          )}
                        >
                          {formatNumber(qtyBase)}
                          {over && (
                            <AlertTriangle
                              className="inline w-3.5 h-3.5 ml-1 text-amber-500"
                              aria-label="Vượt tồn"
                            />
                          )}
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
                              className={cn(
                                "text-right h-8 flex-1 min-w-0",
                                over && "border-amber-500 ring-1 ring-amber-300",
                              )}
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

          {oversold.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {oversold.length} sản phẩm bán vượt tồn — sẽ cho phép nhưng tồn sẽ
                xuống âm.
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
                <span>Tổng tiền:</span>
                <span>{formatVND(subtotal)}</span>
              </div>
              {customerId && (
                <div className="flex justify-between text-neutral-500">
                  <span>Nợ cũ KH:</span>
                  <span
                    className={
                      oldDebt > 0 ? "text-amber-600" : oldDebt < 0 ? "text-green-700" : ""
                    }
                  >
                    {formatVND(oldDebt)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <Label className="shrink-0">Đã thu:</Label>
                <NumberInput
                  value={Number(paid) || 0}
                  onChange={(n) => setPaid(String(n))}
                  className="text-right max-w-40 h-8"
                />
              </div>
              {customerId && (
                <div className="flex justify-between font-medium border-t pt-1.5">
                  <span>Tổng nợ sau giao dịch:</span>
                  <span
                    className={
                      newDebt > 0
                        ? "text-amber-700"
                        : newDebt < 0
                          ? "text-green-700"
                          : "text-neutral-700"
                    }
                  >
                    {formatVND(newDebt)}
                  </span>
                </div>
              )}
              {!customerId && paidNum < subtotal && (
                <div className="flex justify-between text-amber-600 font-medium">
                  <span>Công nợ phải thu:</span>
                  <span>{formatVND(subtotal - paidNum)}</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Hủy
            </Button>
            {customerId && oldDebt > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setPaid(String(subtotal + oldDebt))}
                disabled={subtotal === 0}
                title="Thu đủ tiền hàng + nợ cũ"
              >
                Thu cả nợ cũ
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPaid(String(subtotal))}
              disabled={subtotal === 0}
            >
              Thu đủ
            </Button>
            <Button
              type="submit"
              disabled={create.isPending || cancel.isPending || lines.length === 0}
            >
              {create.isPending || cancel.isPending
                ? "Đang lưu..."
                : isEdit
                  ? "Cập nhật (hủy cũ + tạo mới)"
                  : "Tạo phiếu bán"}
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
