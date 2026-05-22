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
import { useUpdateCashTransactionDate } from "@/hooks/useCash";
import { dateTimeLocalToDb, formatVND, toDateTimeLocalValue } from "@/lib/utils";
import type { CashRow } from "@/db/cash";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transaction: CashRow | null;
};

export function EditCashDateDialog({ open, onOpenChange, transaction }: Props) {
  const [datetime, setDatetime] = useState("");
  const update = useUpdateCashTransactionDate();

  useEffect(() => {
    if (open && transaction) {
      setDatetime(toDateTimeLocalValue(transaction.created_at));
    }
  }, [open, transaction]);

  if (!transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datetime) {
      toast.error("Phải chọn ngày giờ");
      return;
    }
    try {
      await update.mutateAsync({
        id: transaction.id,
        createdAt: dateTimeLocalToDb(datetime),
      });
      toast.success("Đã cập nhật ngày giờ");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sửa ngày giờ giao dịch</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 p-3 bg-neutral-50 rounded border border-neutral-200 text-sm">
            <div>
              <span className="text-neutral-500">Loại: </span>
              <strong>{transaction.type === "in" ? "Thu" : "Chi"}</strong>
            </div>
            <div>
              <span className="text-neutral-500">Số tiền: </span>
              <strong>{formatVND(transaction.amount)}</strong>
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

          <div className="space-y-1.5">
            <Label>Ngày giờ</Label>
            <Input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              autoFocus
            />
          </div>

          <p className="text-xs text-neutral-500">
            Giao dịch tự sinh từ đơn hàng / thu-trả nợ — chỉ sửa được ngày giờ.
            Số tiền và loại phải sửa ở đơn / phiếu gốc.
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
