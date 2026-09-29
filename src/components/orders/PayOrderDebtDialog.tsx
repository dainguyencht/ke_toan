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
import { cn, formatVND } from "@/lib/utils";
import type { CashMethod } from "@/domain/types";
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
  const [method, setMethod] = useState<CashMethod>("cash");
  const pay = usePayOrderDebt();

  const remaining = order ? Math.max(0, order.total - order.paid) : 0;
  const isSale = order?.type === "sale";
  const verb = isSale ? "thu" : "trả";
  const Verb = isSale ? "Thu" : "Trả";

  useEffect(() => {
    if (open && order) {
      setAmount(String(remaining));
      setNote("");
      setMethod("cash");
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
        method,
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
