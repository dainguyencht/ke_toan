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
import { usePayDebt } from "@/hooks/useContacts";
import { cn, dateTimeLocalToDb, formatVND, toDateTimeLocalValue } from "@/lib/utils";
import type { CashMethod } from "@/domain/types";
import type { Contact, ContactKind } from "@/db/contacts";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact: Contact | null;
};

const LABEL: Record<ContactKind, { title: string; verb: string; amountLabel: string }> = {
  customer: { title: "Thu tiền khách hàng", verb: "thu", amountLabel: "Số tiền KH trả" },
  supplier: { title: "Trả tiền nhà cung cấp", verb: "trả", amountLabel: "Số tiền mình trả NCC" },
};

export function PayDebtDialog({ open, onOpenChange, kind, contact }: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [datetime, setDatetime] = useState("");
  const [method, setMethod] = useState<CashMethod>("cash");
  const pay = usePayDebt(kind);
  const labels = LABEL[kind];

  useEffect(() => {
    if (open && contact) {
      // Mặc định gợi ý = nợ hiện tại (nếu > 0); KH đã dư thì để trống
      setAmount(contact.debt_amount > 0 ? String(contact.debt_amount) : "");
      setNote("");
      setDatetime(toDateTimeLocalValue(new Date()));
      setMethod("cash");
    }
  }, [open, contact]);

  const amountNum = Number(amount) || 0;
  const debt = contact?.debt_amount ?? 0;
  // Dư nợ sau giao dịch (có thể âm = KH/NCC trả trước, dư tiền)
  const newDebt = debt - amountNum;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    if (amountNum <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    if (!datetime) {
      toast.error("Phải chọn ngày giờ");
      return;
    }
    try {
      await pay.mutateAsync({
        contactId: contact.id,
        amount: amountNum,
        note: note.trim() || null,
        createdAt: dateTimeLocalToDb(datetime),
        method,
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
              <span className="text-neutral-500">Dư nợ hiện tại: </span>
              <strong
                className={
                  debt > 0
                    ? "text-amber-700"
                    : debt < 0
                      ? "text-green-700"
                      : "text-neutral-500"
                }
              >
                {formatVND(debt)}
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={labels.amountLabel}>
              <NumberInput
                value={amountNum}
                onChange={(n) => setAmount(String(n))}
                autoFocus
              />
              {amountNum > debt && debt > 0 && (
                <p className="text-xs text-neutral-500 mt-1">
                  Trả vượt nợ {formatVND(amountNum - debt)} - ghi nhận trả trước.
                </p>
              )}
              {amountNum > 0 && debt <= 0 && (
                <p className="text-xs text-neutral-500 mt-1">
                  Hiện không có công nợ - toàn bộ ghi nhận trả trước.
                </p>
              )}
            </Field>
            <Field label="Ngày giờ">
              <Input
                type="datetime-local"
                value={datetime}
                onChange={(e) => setDatetime(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Hình thức">
            <div className="flex w-fit rounded-md border border-neutral-300 bg-white p-0.5">
              {(["cash", "transfer"] as CashMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cn(
                    "px-3 py-1 text-sm rounded whitespace-nowrap",
                    method === m
                      ? m === "cash"
                        ? "bg-amber-50 text-amber-700 font-medium"
                        : "bg-sky-50 text-sky-700 font-medium"
                      : "text-neutral-500 hover:bg-neutral-100",
                  )}
                >
                  {m === "cash" ? "Tiền mặt" : "Chuyển khoản"}
                </button>
              ))}
            </div>
          </Field>

          <div className="text-sm text-neutral-600 flex justify-between border-t pt-2">
            <span>Dư nợ sau giao dịch:</span>
            <strong
              className={
                newDebt > 0
                  ? "text-amber-700"
                  : newDebt < 0
                    ? "text-green-700"
                    : "text-neutral-500"
              }
            >
              {formatVND(newDebt)}
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
            <Button type="submit" disabled={pay.isPending || amountNum <= 0}>
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
