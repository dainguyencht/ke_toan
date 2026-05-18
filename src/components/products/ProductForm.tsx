import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateProduct, useUpdateProduct } from "@/hooks/useProducts";
import { useUnitsOfProduct } from "@/hooks/useUnits";
import type { Product, ProductUnit } from "@/domain/types";
import type { UnitInput } from "@/db/units";

// Ref ổn định cho default empty array — tránh infinite re-render trong useEffect
const EMPTY_UNITS: ProductUnit[] = [];
import { formatVND } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
};

type FormState = {
  sku: string;
  name: string;
  barcode: string;
  unit: string;
  price_sell: string;
  price_cost: string;
  initial_stock: string;
  note: string;
};

type ExtraUnitRow = {
  name: string;
  factor: string;
  price_sell: string; // "" = dùng giá tự tính
  price_cost: string;
};

const EMPTY: FormState = {
  sku: "",
  name: "",
  barcode: "",
  unit: "cái",
  price_sell: "0",
  price_cost: "0",
  initial_stock: "0",
  note: "",
};

export function ProductForm({ open, onOpenChange, product }: Props) {
  const isEdit = !!product;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [extraUnits, setExtraUnits] = useState<ExtraUnitRow[]>([]);

  const create = useCreateProduct();
  const update = useUpdateProduct();
  const { data: existingUnits = EMPTY_UNITS } = useUnitsOfProduct(
    product?.id ?? null,
  );

  useEffect(() => {
    if (!open) return;
    setForm(
      product
        ? {
            sku: product.sku,
            name: product.name,
            barcode: product.barcode ?? "",
            unit: product.unit,
            price_sell: String(product.price_sell),
            price_cost: String(product.price_cost),
            initial_stock: "0",
            note: product.note ?? "",
          }
        : EMPTY,
    );
  }, [open, product]);

  // Load extra units khi mở form edit (chỉ những unit không phải base)
  useEffect(() => {
    if (open && product) {
      const extras = existingUnits
        .filter((u) => !u.is_base)
        .map((u) => ({
          name: u.name,
          factor: String(u.factor),
          price_sell: u.price_sell == null ? "" : String(u.price_sell),
          price_cost: u.price_cost == null ? "" : String(u.price_cost),
        }));
      setExtraUnits(extras);
    } else if (open && !product) {
      setExtraUnits([]);
    }
  }, [open, product, existingUnits]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addExtraUnit = () =>
    setExtraUnits((prev) => [
      ...prev,
      { name: "", factor: "", price_sell: "", price_cost: "" },
    ]);
  const removeExtraUnit = (idx: number) =>
    setExtraUnits((prev) => prev.filter((_, i) => i !== idx));
  const updateExtraUnit = (idx: number, patch: Partial<ExtraUnitRow>) =>
    setExtraUnits((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error("Mã sản phẩm và tên sản phẩm bắt buộc");
      return;
    }

    // Validate extra units
    const cleanExtras: UnitInput[] = [];
    for (let i = 0; i < extraUnits.length; i++) {
      const u = extraUnits[i];
      if (!u.name.trim()) continue; // bỏ dòng trống
      const f = Number(u.factor);
      if (!Number.isFinite(f) || f <= 0) {
        toast.error(`Dòng đơn vị #${i + 1}: hệ số phải > 0`);
        return;
      }
      cleanExtras.push({
        name: u.name.trim(),
        factor: f,
        price_sell: u.price_sell === "" ? null : Number(u.price_sell),
        price_cost: u.price_cost === "" ? null : Number(u.price_cost),
      });
    }
    // Check trùng tên với base
    const baseUnit = form.unit.trim() || "cái";
    if (cleanExtras.some((u) => u.name === baseUnit)) {
      toast.error(`Đơn vị quy đổi không được trùng với đơn vị cơ bản "${baseUnit}"`);
      return;
    }
    // Check trùng tên lẫn nhau
    const names = cleanExtras.map((u) => u.name);
    if (new Set(names).size !== names.length) {
      toast.error("Các đơn vị quy đổi có tên trùng nhau");
      return;
    }

    const input = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      unit: baseUnit,
      price_sell: Number(form.price_sell) || 0,
      price_cost: Number(form.price_cost) || 0,
      note: form.note.trim() || null,
    };

    try {
      if (isEdit && product) {
        await update.mutateAsync({ id: product.id, input, extra_units: cleanExtras });
        toast.success("Đã cập nhật sản phẩm");
      } else {
        await create.mutateAsync({
          ...input,
          initial_stock: Number(form.initial_stock) || 0,
          extra_units: cleanExtras,
        });
        toast.success("Đã thêm sản phẩm");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const busy = create.isPending || update.isPending;
  const basePriceSell = Number(form.price_sell) || 0;
  const basePriceCost = Number(form.price_cost) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa sản phẩm" : "Thêm sản phẩm mới"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin sản phẩm"
              : "Thêm sản phẩm và tồn kho đầu kỳ (nếu có)"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mã sản phẩm *">
              <Input
                value={form.sku}
                onChange={(e) => set("sku", e.target.value)}
                placeholder="VD: SP001"
                autoFocus
              />
            </Field>
            <Field label="Mã vạch">
              <Input
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
                placeholder="EAN-13 hoặc UPC"
              />
            </Field>
          </div>

          <Field label="Tên sản phẩm *">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="VD: Áo polo nam"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Đơn vị cơ bản">
              <Input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
                placeholder="VD: m², kg, cái"
              />
            </Field>
            <Field label="Giá vốn (VND)">
              <Input
                type="number"
                inputMode="numeric"
                value={form.price_cost}
                onChange={(e) => set("price_cost", e.target.value)}
              />
            </Field>
            <Field label="Giá bán (VND)">
              <Input
                type="number"
                inputMode="numeric"
                value={form.price_sell}
                onChange={(e) => set("price_sell", e.target.value)}
              />
            </Field>
          </div>

          {!isEdit && (
            <Field label="Tồn kho đầu kỳ">
              <Input
                type="number"
                inputMode="numeric"
                value={form.initial_stock}
                onChange={(e) => set("initial_stock", e.target.value)}
              />
              <p className="text-xs text-neutral-500 mt-1">
                Tính theo đơn vị cơ bản
              </p>
            </Field>
          )}

          {/* === Đơn vị quy đổi === */}
          <div className="border-t border-neutral-200 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>Đơn vị quy đổi</Label>
                <p className="text-xs text-neutral-500 mt-0.5">
                  VD: nếu cơ bản là <strong>m²</strong>, có thể thêm{" "}
                  <strong>hộp</strong> với hệ số 1.5 (1 hộp = 1.5 m²)
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addExtraUnit}>
                <Plus className="w-4 h-4" />
                Thêm đơn vị
              </Button>
            </div>

            {extraUnits.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="grid grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] gap-2 text-xs text-neutral-500 px-1">
                  <span>Tên</span>
                  <span>Hệ số (vs cơ bản)</span>
                  <span>Giá bán (để trống = tự tính)</span>
                  <span>Giá vốn (để trống = tự tính)</span>
                  <span></span>
                </div>
                {extraUnits.map((u, idx) => {
                  const f = Number(u.factor) || 0;
                  const autoSell = basePriceSell * f;
                  const autoCost = basePriceCost * f;
                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-[1fr_1fr_1.2fr_1.2fr_auto] gap-2 items-start"
                    >
                      <Input
                        value={u.name}
                        onChange={(e) => updateExtraUnit(idx, { name: e.target.value })}
                        placeholder="hộp"
                        className="h-9"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={u.factor}
                        onChange={(e) => updateExtraUnit(idx, { factor: e.target.value })}
                        placeholder="1.5"
                        className="h-9"
                      />
                      <div>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={u.price_sell}
                          onChange={(e) =>
                            updateExtraUnit(idx, { price_sell: e.target.value })
                          }
                          placeholder={f > 0 ? formatVND(autoSell) : ""}
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={u.price_cost}
                          onChange={(e) =>
                            updateExtraUnit(idx, { price_cost: e.target.value })
                          }
                          placeholder={f > 0 ? formatVND(autoCost) : ""}
                          className="h-9"
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeExtraUnit(idx)}
                        title="Xóa đơn vị này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Field label="Ghi chú">
            <Input
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo sản phẩm"}
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
