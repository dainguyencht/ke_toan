import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
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
import { Abbr } from "@/components/ui/abbr";
import { ContactPicker } from "@/components/contacts/ContactPicker";
import { ProductPicker } from "@/components/products/ProductPicker";
import { useCreateSale } from "@/hooks/useOrders";
import { formatVND } from "@/lib/utils";
import { toast } from "sonner";
import type { ProductWithStock } from "@/db/products";

type Line = {
  variant_id: number;
  product_id: number;
  product_name: string;
  sku: string;
  qty: number;
  price: number;
  available: number; // tồn snapshot lúc thêm vào (để cảnh báo oversell)
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function SaleForm({ open, onOpenChange }: Props) {
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [paid, setPaid] = useState("0");
  const [note, setNote] = useState("");

  const create = useCreateSale();

  const reset = () => {
    setCustomerId(null);
    setLines([]);
    setPaid("0");
    setNote("");
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const addProduct = (p: ProductWithStock | null) => {
    if (!p || !p.default_variant_id) return;
    if (lines.some((l) => l.product_id === p.id)) {
      toast.info("Sản phẩm đã có trong phiếu");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        variant_id: p.default_variant_id!,
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        qty: 1,
        price: p.price_sell,
        available: p.total_stock,
      },
    ]);
  };

  const updateLine = (idx: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const paidNum = Number(paid) || 0;
  const debt = Math.max(0, subtotal - paidNum);
  const oversold = lines.filter((l) => l.qty > l.available);

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
    if (debt > 0 && !customerId) {
      toast.error("Có công nợ nhưng chưa chọn khách. Hoặc chọn KH, hoặc thu đủ.");
      return;
    }
    try {
      await create.mutateAsync({
        customer_id: customerId,
        note: note.trim() || null,
        paid: paidNum,
        items: lines.map((l) => ({
          variant_id: l.variant_id,
          product_name: l.product_name,
          qty: l.qty,
          price: l.price,
        })),
      });
      toast.success("Đã tạo phiếu bán");
      handleClose(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Tạo phiếu bán</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Khách hàng (KH)">
              <ContactPicker
                kind="customer"
                value={customerId}
                onChange={setCustomerId}
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
                    <TH>
                      <Abbr title="Stock Keeping Unit - Mã định danh sản phẩm">
                        SKU
                      </Abbr>
                    </TH>
                    <TH>Tên sản phẩm</TH>
                    <TH className="w-20 text-right">
                      <Abbr title="Số lượng còn trong kho">Tồn</Abbr>
                    </TH>
                    <TH className="w-24 text-right">
                      <Abbr title="Số lượng bán">SL bán</Abbr>
                    </TH>
                    <TH className="w-32 text-right">Đơn giá bán</TH>
                    <TH className="w-32 text-right">Thành tiền</TH>
                    <TH className="w-12"></TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.map((l, idx) => {
                    const over = l.qty > l.available;
                    return (
                      <TR key={l.product_id}>
                        <TD className="font-mono text-xs">{l.sku}</TD>
                        <TD>{l.product_name}</TD>
                        <TD className="text-right text-neutral-500">{l.available}</TD>
                        <TD>
                          <div className="relative">
                            <Input
                              type="number"
                              inputMode="decimal"
                              value={l.qty}
                              onChange={(e) =>
                                updateLine(idx, { qty: Number(e.target.value) })
                              }
                              className={`text-right h-8 ${
                                over ? "border-amber-500 ring-1 ring-amber-300" : ""
                              }`}
                            />
                            {over && (
                              <AlertTriangle
                                className="absolute right-1 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-amber-500"
                                aria-label="Vượt tồn"
                              />
                            )}
                          </div>
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
                        </TD>
                        <TD className="text-right font-medium">
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
              <div className="flex justify-between">
                <span className="text-neutral-500">Tổng số lượng:</span>
                <span>{lines.reduce((s, l) => s + l.qty, 0)}</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between font-medium text-base">
                <span>Tổng tiền:</span>
                <span>{formatVND(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label className="shrink-0">Đã thu:</Label>
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
                  <span>Công nợ phải thu:</span>
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
              Thu đủ
            </Button>
            <Button type="submit" disabled={create.isPending || lines.length === 0}>
              {create.isPending ? "Đang lưu..." : "Tạo phiếu bán"}
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
