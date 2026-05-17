import { useEffect, useState } from "react";
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
import { useCreateCashTransaction } from "@/hooks/useCash";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PRESETS_IN = ["Thu công nợ KH", "Vốn chủ thêm vào", "Khác"];
const PRESETS_OUT = [
  "Lương nhân viên",
  "Tiền điện",
  "Tiền nước",
  "Tiền thuê mặt bằng",
  "Phí vận chuyển",
  "Rút vốn",
  "Khác",
];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

type FormState = {
  type: "in" | "out";
  amount: string;
  category: string;
  customCategory: string;
  note: string;
};

const EMPTY: FormState = {
  type: "out",
  amount: "",
  category: "",
  customCategory: "",
  note: "",
};

export function CashTransactionForm({ open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const create = useCreateCashTransaction();

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const presets = form.type === "in" ? PRESETS_IN : PRESETS_OUT;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    const finalCategory =
      form.category === "Khác" ? form.customCategory.trim() : form.category;
    if (!finalCategory) {
      toast.error("Phải chọn hoặc nhập danh mục");
      return;
    }

    try {
      await create.mutateAsync({
        type: form.type,
        amount,
        category: finalCategory,
        note: form.note.trim() || null,
      });
      toast.success(form.type === "in" ? "Đã ghi nhận thu" : "Đã ghi nhận chi");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ghi giao dịch tiền mặt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Thu / Chi */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => set("type", "in")}
              className={cn(
                "py-2 rounded-md font-medium border text-sm",
                form.type === "in"
                  ? "bg-green-50 border-green-300 text-green-700"
                  : "bg-white border-neutral-300 text-neutral-500",
              )}
            >
              Thu (+)
            </button>
            <button
              type="button"
              onClick={() => set("type", "out")}
              className={cn(
                "py-2 rounded-md font-medium border text-sm",
                form.type === "out"
                  ? "bg-red-50 border-red-300 text-red-700"
                  : "bg-white border-neutral-300 text-neutral-500",
              )}
            >
              Chi (−)
            </button>
          </div>

          <Field label="Số tiền (VND)">
            <Input
              type="number"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              placeholder="0"
              autoFocus
            />
          </Field>

          <Field label="Danh mục">
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="">-- Chọn danh mục --</option>
              {presets.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>

          {form.category === "Khác" && (
            <Field label="Nhập danh mục">
              <Input
                value={form.customCategory}
                onChange={(e) => set("customCategory", e.target.value)}
                placeholder="VD: Phí internet"
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
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Đang lưu..." : "Lưu"}
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
