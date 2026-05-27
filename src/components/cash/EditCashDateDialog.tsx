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
import { useUpdateLinkedCash } from "@/hooks/useCash";
import { dateTimeLocalToDb, toDateTimeLocalValue } from "@/lib/utils";
import type { CashRow } from "@/db/cash";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: CashRow | null;
};

/**
 * Sửa giao dịch CÓ LIÊN KẾT (ref_table='orders' hoặc 'customers'/'suppliers').
 * Cho phép đổi cả số tiền + ngày giờ. Tự sync nợ contact và order.paid.
 */
export function EditCashDateDialog({ open, onOpenChange, transaction }: Props) {
  const [amount, setAmount] = useState<number>(0);
  const [datetime, setDatetime] = useState("");
  const update = useUpdateLinkedCash();

  useEffect(() => {
    if (open && transaction) {
      setAmount(transaction.amount);
      setDatetime(toDateTimeLocalValue(transaction.created_at));
    }
  }, [open, transaction]);

  if (!transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    if (!datetime) {
      toast.error("Phải chọn ngày giờ");
      return;
    }
    try {
      await update.mutateAsync({
        id: transaction.id,
        amount,
        createdAt: dateTimeLocalToDb(datetime),
      });
      toast.success("Đã cập nhật giao dịch");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa giao dịch</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 p-3 bg-neutral-50 rounded border border-neutral-200 text-sm">
            <div>
              <span className="text-neutral-500">Loại: </span>
              <strong>{transaction.type === "in" ? "Thu" : "Chi"}</strong>
            </div>
            <div>
              <span className="text-neutral-500">Danh mục: </span>
              {transaction.category ?? "-"}
            </div>
            {transaction.source_label && (
              <div>
                <span className="text-neutral-500">Nguồn: </span>
                <span className="font-mono text-xs">
                  {transaction.source_label}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Số tiền</Label>
              <NumberInput
                value={amount}
                onChange={(n) => setAmount(n)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ngày giờ</Label>
              <Input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-neutral-500">
            Khi sửa số tiền, hệ thống tự đồng bộ công nợ KH/NCC và{" "}
            <code>order.paid</code> để khớp.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? "Đang lưu..." : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
