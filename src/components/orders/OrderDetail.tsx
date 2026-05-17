import { XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useCancelOrder, useOrder, useOrderItems } from "@/hooks/useOrders";
import { cn, formatDateTime, formatVND } from "@/lib/utils";
import type { OrderStatus, OrderType } from "@/domain/types";
import { toast } from "sonner";

const STATUS_LABEL: Record<OrderStatus, { text: string; tone: string }> = {
  draft: { text: "Nháp", tone: "text-neutral-500 bg-neutral-100" },
  confirmed: { text: "Đã chốt", tone: "text-blue-700 bg-blue-50" },
  delivered: { text: "Đã giao", tone: "text-amber-700 bg-amber-50" },
  paid: { text: "Đã thanh toán", tone: "text-green-700 bg-green-50" },
  cancelled: { text: "Đã hủy", tone: "text-red-700 bg-red-50" },
};

const TYPE_LABEL: Record<OrderType, string> = {
  sale: "Phiếu bán",
  purchase: "Phiếu nhập",
  return: "Phiếu trả",
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: number | null;
};

export function OrderDetail({ open, onOpenChange, orderId }: Props) {
  const { data: order, isLoading } = useOrder(orderId);
  const { data: items = [] } = useOrderItems(orderId);
  const cancel = useCancelOrder();

  const handleCancel = async () => {
    if (!order) return;
    const ok = confirm(
      `Hủy đơn ${order.code}?\n\n` +
        `• Tồn kho sẽ được hoàn lại\n` +
        `• Sổ quỹ sẽ ghi đối ứng (KHÔNG xóa dòng gốc)\n` +
        `• Công nợ ${order.type === "sale" ? "KH" : "NCC"} sẽ trừ về\n\n` +
        `Hành động này không thể revert tự động — bạn sẽ phải tạo lại đơn nếu hủy nhầm.`,
    );
    if (!ok) return;
    try {
      await cancel.mutateAsync(order.id);
      toast.success("Đã hủy đơn");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const debt = order ? Math.max(0, order.total - order.paid) : 0;
  const isCancelled = order?.status === "cancelled";
  const canCancel = order && !isCancelled && order.type !== "return";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-base">{order?.code ?? "..."}</span>
            {order && (
              <>
                <span className="text-sm text-neutral-500 font-normal">
                  {TYPE_LABEL[order.type]}
                </span>
                <span
                  className={cn(
                    "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                    STATUS_LABEL[order.status].tone,
                  )}
                >
                  {STATUS_LABEL[order.status].text}
                </span>
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="p-4 text-neutral-500">Đang tải...</div>
        ) : !order ? (
          <div className="p-4 text-neutral-500">Không tìm thấy đơn</div>
        ) : (
          <div className="space-y-4">
            {/* Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <InfoCell label="Thời gian">
                {formatDateTime(order.created_at)}
              </InfoCell>
              <InfoCell label={order.type === "sale" ? "Khách hàng" : "Nhà cung cấp"}>
                {order.partner_name ?? <span className="text-neutral-400">-</span>}
              </InfoCell>
              {order.note && (
                <InfoCell label="Ghi chú" wide>
                  {order.note}
                </InfoCell>
              )}
            </div>

            {/* Items */}
            <div className="border border-neutral-200 rounded-md">
              <Table>
                <THead>
                  <TR>
                    <TH>SKU</TH>
                    <TH>Sản phẩm</TH>
                    <TH className="text-right">SL</TH>
                    <TH className="text-right">Đơn giá</TH>
                    {order.type === "sale" && (
                      <TH className="text-right">Giá vốn</TH>
                    )}
                    <TH className="text-right">Thành tiền</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((it) => (
                    <TR key={it.id}>
                      <TD className="font-mono text-xs">{it.sku}</TD>
                      <TD>{it.product_name}</TD>
                      <TD className="text-right tabular-nums">{it.qty}</TD>
                      <TD className="text-right tabular-nums">{formatVND(it.price)}</TD>
                      {order.type === "sale" && (
                        <TD className="text-right tabular-nums text-neutral-500">
                          {formatVND(it.cost)}
                        </TD>
                      )}
                      <TD className="text-right tabular-nums font-medium">
                        {formatVND(it.total)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-6 text-sm pt-2 border-t border-neutral-200">
              <div />
              <div className="space-y-1.5">
                <Row label="Tổng tiền" value={formatVND(order.total)} bold />
                <Row
                  label={order.type === "sale" ? "Đã thu" : "Đã trả"}
                  value={formatVND(order.paid)}
                />
                {debt > 0 && (
                  <Row
                    label={
                      order.type === "sale" ? "Còn phải thu" : "Còn phải trả"
                    }
                    value={formatVND(debt)}
                    tone="amber"
                  />
                )}
              </div>
            </div>

            {isCancelled && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                Đơn này đã bị hủy. Tồn kho, sổ quỹ và công nợ đã được đảo ngược.
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {canCancel && (
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancel.isPending}
            >
              <XCircle className="w-4 h-4" />
              {cancel.isPending ? "Đang hủy..." : "Hủy đơn"}
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoCell({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-neutral-800 mt-0.5">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone = "neutral",
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "neutral" | "amber";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          bold && "font-semibold text-base",
          tone === "amber" && "text-amber-700 font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}
