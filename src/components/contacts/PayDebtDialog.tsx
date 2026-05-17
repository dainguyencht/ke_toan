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
import { usePayDebt } from "@/hooks/useContacts";
import { formatVND } from "@/lib/utils";
import type { Contact, ContactKind } from "@/db/contacts";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact: Contact | null;
};

const LABEL: Record<ContactKind, { title: string; verb: string; amountLabel: string }> = {
  customer: { title: "Thu nợ khách hàng", verb: "thu", amountLabel: "Số tiền KH trả" },
  supplier: { title: "Trả nợ nhà cung cấp", verb: "trả", amountLabel: "Số tiền mình trả NCC" },
};

export function PayDebtDialog({ open, onOpenChange, kind, contact }: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const pay = usePayDebt(kind);
  const labels = LABEL[kind];

  useEffect(() => {
    if (open && contact) {
      setAmount(String(contact.debt_amount));
      setNote("");
    }
  }, [open, contact]);

  const amountNum = Number(amount) || 0;
  const debt = contact?.debt_amount ?? 0;
  const remaining = Math.max(0, debt - amountNum);
  const tooMuch = amountNum > debt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    if (amountNum <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    if (tooMuch) {
      toast.error("Số tiền lớn hơn công nợ");
      return;
    }
    try {
      await pay.mutateAsync({
        contactId: contact.id,
        amount: amountNum,
        note: note.trim() || null,
      });
      toast.success(`Đã ${labels.verb} ${formatVND(amountNum)}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 p-3 bg-neutral-50 rounded border border-neutral-200">
            <div className="text-sm">
              <span className="text-neutral-500">Đối tác: </span>
              <strong>{contact.name}</strong>
              {contact.phone && (
                <span className="text-neutral-500"> · {contact.phone}</span>
              )}
            </div>
            <div className="text-sm">
              <span className="text-neutral-500">Công nợ hiện tại: </span>
              <strong className="text-amber-700">{formatVND(debt)}</strong>
            </div>
          </div>

          <Field label={labels.amountLabel}>
            <Input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              className={tooMuch ? "border-red-500 ring-1 ring-red-300" : ""}
            />
            {tooMuch && (
              <p className="text-xs text-red-600 mt-1">
                Số tiền lớn hơn công nợ ({formatVND(debt)})
              </p>
            )}
          </Field>

          <div className="text-sm text-neutral-600 flex justify-between border-t pt-2">
            <span>Còn lại sau khi {labels.verb}:</span>
            <strong className={remaining > 0 ? "text-amber-700" : "text-green-700"}>
              {formatVND(remaining)}
            </strong>
          </div>

          <Field label="Ghi chú (tùy chọn)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: KH trả tiền mặt tại quầy"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={pay.isPending || amountNum <= 0 || tooMuch}>
              {pay.isPending ? "Đang lưu..." : `Xác nhận ${labels.verb}`}
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
