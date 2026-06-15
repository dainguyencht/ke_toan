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
import { useCreateDebtAdjustment } from "@/hooks/useContacts";
import { cn, formatVND } from "@/lib/utils";
import type { Contact, ContactKind } from "@/db/contacts";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact: Contact | null;
};

export function AdjustDebtDialog({ open, onOpenChange, kind, contact }: Props) {
  const [newDebt, setNewDebt] = useState(0);
  const [note, setNote] = useState("");
  const adjust = useCreateDebtAdjustment();

  useEffect(() => {
    if (open && contact) {
      setNewDebt(contact.debt_amount ?? 0);
      setNote("");
    }
  }, [open, contact]);

  if (!contact) return null;

  const currentDebt = contact.debt_amount ?? 0;
  const change = newDebt - currentDebt;
  const label = kind === "customer" ? "KH" : "NCC";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newDebt === currentDebt) {
      toast.error("Dư nợ mới giống dư nợ hiện tại, không có gì để điều chỉnh");
      return;
    }
    try {
      await adjust.mutateAsync({
        kind,
        contactId: contact.id,
        newDebt,
        note: note.trim() || "Điều chỉnh dư nợ",
      });
      toast.success("Đã tạo phiếu điều chỉnh dư nợ");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Điều chỉnh dư nợ — {contact.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border border-neutral-200 rounded-md bg-neutral-50 p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-neutral-500">Dư nợ hiện tại:</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  currentDebt > 0
                    ? "text-amber-700"
                    : currentDebt < 0
                      ? "text-green-700"
                      : "text-neutral-500",
                )}
              >
                {formatVND(currentDebt)}
              </span>
            </div>
            {change !== 0 && (
              <div className="flex justify-between pt-1 border-t border-neutral-200">
                <span className="text-neutral-500">Chênh lệch:</span>
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    change > 0 ? "text-amber-700" : "text-green-700",
                  )}
                >
                  {change > 0 ? "+" : "−"}
                  {formatVND(Math.abs(change))}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Dư nợ mới (VNĐ)</Label>
            <NumberInput
              value={newDebt}
              onChange={(n) => setNewDebt(n)}
              placeholder="0"
              autoFocus
            />
            <p className="text-xs text-neutral-500">
              Số tiền {label} còn nợ sau khi điều chỉnh. Phiếu điều chỉnh sẽ hiện
              trong lịch sử giao dịch, không ghi vào sổ quỹ.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Ghi chú</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Nhập nợ cũ trước khi dùng app"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending ? "Đang lưu..." : "Lưu điều chỉnh"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
