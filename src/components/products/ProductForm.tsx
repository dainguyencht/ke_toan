import { useEffect, useState } from "react";
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
import type { Product } from "@/domain/types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null; // null/undefined = tạo mới
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
  const create = useCreateProduct();
  const update = useUpdateProduct();

  useEffect(() => {
    if (open) {
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
    }
  }, [open, product]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error("SKU và tên sản phẩm bắt buộc");
      return;
    }

    const input = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      barcode: form.barcode.trim() || null,
      unit: form.unit.trim() || "cái",
      price_sell: Number(form.price_sell) || 0,
      price_cost: Number(form.price_cost) || 0,
      note: form.note.trim() || null,
    };

    try {
      if (isEdit && product) {
        await update.mutateAsync({ id: product.id, input });
        toast.success("Đã cập nhật sản phẩm");
      } else {
        await create.mutateAsync({
          ...input,
          initial_stock: Number(form.initial_stock) || 0,
        });
        toast.success("Đã thêm sản phẩm");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
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
            <Field label="SKU *">
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
            <Field label="Đơn vị">
              <Input
                value={form.unit}
                onChange={(e) => set("unit", e.target.value)}
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
            </Field>
          )}

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
