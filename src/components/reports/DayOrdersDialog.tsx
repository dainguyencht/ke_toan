import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { useOrders } from "@/hooks/useOrders";
import { formatDate, formatDateTime, formatVND } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  date: string | null;
};

export function DayOrdersDialog({ open, onOpenChange, date }: Props) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const { data: rows = [], isLoading } = useOrders(
    "sale",
    date ? { from: date, to: date } : {},
  );

  const filtered = date ? rows : [];
  const totalRevenue = filtered.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Phiếu bán {date ? `ngày ${formatDate(date)}` : ""}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="p-6 text-neutral-500 text-sm">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-sm">
              Không có phiếu bán nào.
            </div>
          ) : (
            <div className="border border-neutral-200 rounded-md">
              <Table>
                <THead className="sticky top-0 z-10">
                  <TR>
                    <TH>Mã phiếu</TH>
                    <TH>Thời gian</TH>
                    <TH>Khách hàng</TH>
                    <TH className="text-right">Số mặt hàng</TH>
                    <TH className="text-right">Đã trả</TH>
                    <TH className="text-right">Thành tiền</TH>
                  </TR>
                </THead>
                <TBody>
                  {filtered.map((r) => (
                    <TR
                      key={r.id}
                      onClick={() => setDetailId(r.id)}
                      className="cursor-pointer"
                    >
                      <TD className="font-mono text-xs">{r.code}</TD>
                      <TD className="text-neutral-600 whitespace-nowrap">
                        {formatDateTime(r.created_at)}
                      </TD>
                      <TD>
                        {r.partner_name ?? (
                          <span className="text-neutral-400">-</span>
                        )}
                      </TD>
                      <TD className="text-right tabular-nums">{r.item_count}</TD>
                      <TD className="text-right tabular-nums text-neutral-600">
                        {formatVND(r.paid)}
                      </TD>
                      <TD className="text-right tabular-nums font-medium">
                        {formatVND(r.total)}
                      </TD>
                    </TR>
                  ))}
                  <TR className="font-medium bg-neutral-50">
                    <TD colSpan={5}>
                      Tổng cộng ({filtered.length} phiếu)
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatVND(totalRevenue)}
                    </TD>
                  </TR>
                </TBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <OrderDetail
        open={detailId != null}
        onOpenChange={(o) => !o && setDetailId(null)}
        orderId={detailId}
      />
    </>
  );
}
