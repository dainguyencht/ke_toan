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
  useCreateDebtAdjustment,
  useUpdateDebtAdjustment,
} from "@/hooks/useContacts";
import {
  cn,
  dateTimeLocalToDb,
  formatVND,
  toDateTimeLocalValue,
} from "@/lib/utils";
import type {
  Contact,
  ContactKind,
  DebtAdjustment,
} from "@/db/contacts";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact: Contact | null;
  /** Khi truyền: chế độ sửa phiếu DC có sẵn. */
  adjustment?: DebtAdjustment | null;
};

type ChangeSign = "up" | "down";

export function AdjustDebtDialog({
  open,
  onOpenChange,
  kind,
  contact,
  adjustment,
}: Props) {
  const isEdit = !!adjustment;
  const [newDebt, setNewDebt] = useState(0);
  const [changeAbs, setChangeAbs] = useState(0);
  const [changeSign, setChangeSign] = useState<ChangeSign>("up");
  const [note, setNote] = useState("");
  const [datetime, setDatetime] = useState("");
  const create = useCreateDebtAdjustment();
  const update = useUpdateDebtAdjustment();

  useEffect(() => {
    if (!open) return;
    if (adjustment) {
      const base = adjustment.old_debt;
      const nd = adjustment.new_debt;
      const ch = nd - base;
      setNewDebt(nd);
      setChangeAbs(Math.abs(ch));
      setChangeSign(ch >= 0 ? "up" : "down");
      setNote(adjustment.note ?? "");
      setDatetime(toDateTimeLocalValue(adjustment.created_at));
    } else if (contact) {
      setNewDebt(contact.debt_amount ?? 0);
      setChangeAbs(0);
      setChangeSign("up");
      setNote("");
      setDatetime(toDateTimeLocalValue(new Date()));
    }
  }, [open, contact, adjustment]);

  if (!contact) return null;

  // Trong edit mode: so sánh với old_debt (trước khi điều chỉnh ban đầu)
  // Trong create mode: so sánh với dư nợ hiện tại của contact
  const baseDebt = isEdit ? adjustment!.old_debt : contact.debt_amount ?? 0;
  const label = kind === "customer" ? "KH" : "NCC";
  const busy = create.isPending || update.isPending;

  // Handler: user gõ "Dư nợ mới" → tự cập nhật changeAbs + changeSign
  const handleNewDebtChange = (v: number) => {
    setNewDebt(v);
    const ch = v - baseDebt;
    setChangeAbs(Math.abs(ch));
    setChangeSign(ch >= 0 ? "up" : "down");
  };

  // Handler: user gõ "Chênh lệch" → tự cập nhật newDebt
  const handleChangeAbsChange = (v: number) => {
    setChangeAbs(v);
    const signedChange = changeSign === "up" ? v : -v;
    setNewDebt(baseDebt + signedChange);
  };

  const handleSignChange = (s: ChangeSign) => {
    setChangeSign(s);
    const signedChange = s === "up" ? changeAbs : -changeAbs;
    setNewDebt(baseDebt + signedChange);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datetime) {
      toast.error("Phải chọn ngày giờ");
      return;
    }
    const createdAt = dateTimeLocalToDb(datetime);
    const finalNote = note.trim() || (isEdit ? null : "Điều chỉnh dư nợ");

    try {
      if (isEdit && adjustment) {
        if (newDebt === adjustment.new_debt) {
          await update.mutateAsync({
            id: adjustment.id,
            patch: { note: finalNote, createdAt },
          });
        } else {
          await update.mutateAsync({
            id: adjustment.id,
            patch: { newDebt, note: finalNote, createdAt },
          });
        }
        toast.success("Đã cập nhật phiếu điều chỉnh");
      } else {
        if (newDebt === baseDebt) {
          toast.error("Dư nợ mới giống dư nợ hiện tại, không có gì để điều chỉnh");
          return;
        }
        await create.mutateAsync({
          kind,
          contactId: contact.id,
          newDebt,
          note: finalNote,
          createdAt,
        });
        toast.success("Đã tạo phiếu điều chỉnh dư nợ");
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
            {isEdit ? "Sửa phiếu điều chỉnh" : "Điều chỉnh dư nợ"} —{" "}
            {contact.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border border-neutral-200 rounded-md bg-neutral-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-500">
                {isEdit ? "Dư nợ trước điều chỉnh:" : "Dư nợ hiện tại:"}
              </span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  baseDebt > 0
                    ? "text-amber-700"
                    : baseDebt < 0
                      ? "text-green-700"
                      : "text-neutral-500",
                )}
              >
                {formatVND(baseDebt)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dư nợ mới (VNĐ)</Label>
              <NumberInput
                value={newDebt}
                onChange={handleNewDebtChange}
                placeholder="0"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Chênh lệch (VNĐ)</Label>
              <div className="flex gap-1.5">
                <div className="inline-flex rounded-md border border-neutral-300 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => handleSignChange("up")}
                    className={cn(
                      "px-2 text-sm rounded font-medium",
                      changeSign === "up"
                        ? "bg-amber-100 text-amber-800"
                        : "text-neutral-500 hover:bg-neutral-100",
                    )}
                    title="Tăng nợ"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSignChange("down")}
                    className={cn(
                      "px-2 text-sm rounded font-medium",
                      changeSign === "down"
                        ? "bg-green-100 text-green-800"
                        : "text-neutral-500 hover:bg-neutral-100",
                    )}
                    title="Giảm nợ"
                  >
                    −
                  </button>
                </div>
                <NumberInput
                  value={changeAbs}
                  onChange={handleChangeAbsChange}
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Ngày giờ</Label>
            <Input
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Ghi chú</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Nhập nợ cũ trước khi dùng app"
            />
            <p className="text-xs text-neutral-500">
              Phiếu điều chỉnh hiện trong lịch sử {label}, không ghi vào sổ quỹ.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Đang lưu..."
                : isEdit
                  ? "Cập nhật"
                  : "Lưu điều chỉnh"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
