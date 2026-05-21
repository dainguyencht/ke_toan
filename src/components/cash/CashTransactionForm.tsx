import { useEffect, useState } from "react";
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
import {
  useCreateCashTransaction,
  useUpdateCashTransaction,
} from "@/hooks/useCash";
import { cn, dateTimeLocalToDb, toDateTimeLocalValue } from "@/lib/utils";
import type { CashRow } from "@/db/cash";
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
  /** Khi truyền: form ở chế độ sửa giao dịch ghi tay. */
  editTransaction?: CashRow | null;
};

type FormState = {
  type: "in" | "out";
  amount: string;
  category: string;
  customCategory: string;
  note: string;
  datetime: string; // value cho <input type="datetime-local">
};

const emptyForm = (): FormState => ({
  type: "out",
  amount: "",
  category: "",
  customCategory: "",
  note: "",
  datetime: toDateTimeLocalValue(new Date()),
});

export function CashTransactionForm({
  open,
  onOpenChange,
  editTransaction,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const create = useCreateCashTransaction();
  const update = useUpdateCashTransaction();
  const isEdit = editTransaction != null;
  const busy = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (editTransaction) {
      const presets =
        editTransaction.type === "in" ? PRESETS_IN : PRESETS_OUT;
      const cat = editTransaction.category ?? "";
      const known = presets.includes(cat) && cat !== "Khác";
      setForm({
        type: editTransaction.type,
        amount: String(editTransaction.amount),
        category: known ? cat : "Khác",
        customCategory: known ? "" : cat,
        note: editTransaction.note ?? "",
        datetime: toDateTimeLocalValue(editTransaction.created_at),
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, editTransaction]);

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
    if (!form.datetime) {
      toast.error("Phải chọn ngày giờ");
      return;
    }

    const input = {
      type: form.type,
      amount,
      category: finalCategory,
      note: form.note.trim() || null,
      created_at: dateTimeLocalToDb(form.datetime),
    };

    try {
      if (isEdit && editTransaction) {
        await update.mutateAsync({ id: editTransaction.id, input });
        toast.success("Đã cập nhật giao dịch");
      } else {
        await create.mutateAsync(input);
        toast.success(form.type === "in" ? "Đã ghi nhận thu" : "Đã ghi nhận chi");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Sửa giao dịch tiền mặt" : "Ghi giao dịch tiền mặt"}
          </DialogTitle>
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Số tiền (VND)">
              <NumberInput
                value={Number(form.amount) || 0}
                onChange={(n) => set("amount", String(n))}
                placeholder="0"
                autoFocus
              />
            </Field>
            <Field label="Ngày giờ">
              <Input
                type="datetime-local"
                value={form.datetime}
                onChange={(e) => set("datetime", e.target.value)}
              />
            </Field>
          </div>

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
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu..." : isEdit ? "Cập nhật" : "Lưu"}
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
