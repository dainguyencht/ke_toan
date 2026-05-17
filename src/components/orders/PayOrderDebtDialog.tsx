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
import { usePayOrderDebt } from "@/hooks/useOrders";
import { formatVND } from "@/lib/utils";
import type { OrderListRow } from "@/db/orders";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderListRow | null;
};

export function PayOrderDebtDialog({ open, onOpenChange, order }: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const pay = usePayOrderDebt();

  const remaining = order ? Math.max(0, order.total - order.paid) : 0;
  const isSale = order?.type === "sale";
  const verb = isSale ? "thu" : "trả";
  const Verb = isSale ? "Thu" : "Trả";

  useEffect(() => {
    if (open && order) {
      setAmount(String(remaining));
      setNote("");
    }
  }, [open, order, remaining]);

  const amountNum = Number(amount) || 0;
  const newRemaining = Math.max(0, remaining - amountNum);
  const tooMuch = amountNum > remaining;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;
    if (amountNum <= 0) {
      toast.error("Số tiền phải > 0");
      return;
    }
    if (tooMuch) {
      toast.error(`Số tiền lớn hơn còn nợ (${formatVND(remaining)})`);
      return;
    }
    try {
      await pay.mutateAsync({
        orderId: order.id,
        amount: amountNum,
        note: note.trim() || null,
      });
      toast.success(`Đã ${verb} ${formatVND(amountNum)} cho đơn ${order.code}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {Verb} nợ đơn{" "}
            <span className="font-mono text-base">{order.code}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1 p-3 bg-neutral-50 rounded border border-neutral-200 text-sm">
            <Row label={isSale ? "Khách hàng" : "Nhà cung cấp"}>
              {order.partner_name ?? <span className="text-neutral-400">-</span>}
            </Row>
            <Row label="Tổng tiền">{formatVND(order.total)}</Row>
            <Row label={isSale ? "Đã thu" : "Đã trả"}>
              {formatVND(order.paid)}
            </Row>
            <Row label="Còn nợ" highlight>
              {formatVND(remaining)}
            </Row>
          </div>

          <Field label={`Số tiền ${verb}`}>
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
                Số tiền lớn hơn còn nợ ({formatVND(remaining)})
              </p>
            )}
          </Field>

          <div className="text-sm flex justify-between border-t pt-2">
            <span className="text-neutral-500">Còn lại sau khi {verb}:</span>
            <strong className={newRemaining > 0 ? "text-amber-700" : "text-green-700"}>
              {formatVND(newRemaining)}
            </strong>
          </div>

          <Field label="Ghi chú (tùy chọn)">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: KH chuyển khoản, trả tiền mặt..."
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={pay.isPending || amountNum <= 0 || tooMuch}>
              {pay.isPending ? "Đang lưu..." : `Xác nhận ${verb}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  children,
  highlight,
}: {
  label: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}:</span>
      <strong className={highlight ? "text-amber-700" : ""}>{children}</strong>
    </div>
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
