import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { useOrdersByContact } from "@/hooks/useOrders";
import { useContactDebtPayments } from "@/hooks/useCash";
import { useContact, useDeleteDebtPayment } from "@/hooks/useContacts";
import { cn, formatDateTime, formatVND } from "@/lib/utils";
import type { Contact, ContactKind } from "@/db/contacts";
import type { OrderListRow } from "@/db/orders";
import type { OrderStatus } from "@/domain/types";
import { toast } from "sonner";

const STATUS_LABEL: Record<OrderStatus, { text: string; tone: string }> = {
  draft: { text: "Nháp", tone: "text-neutral-500 bg-neutral-100" },
  confirmed: { text: "Đã chốt", tone: "text-blue-700 bg-blue-50" },
  delivered: { text: "Đã giao", tone: "text-amber-700 bg-amber-50" },
  paid: { text: "Đã thanh toán", tone: "text-green-700 bg-green-50" },
  cancelled: { text: "Đã hủy", tone: "text-red-700 bg-red-50" },
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact: Contact | null;
};

export function ContactOrdersDialog({
  open,
  onOpenChange,
  kind,
  contact,
}: Props) {
  const [detailId, setDetailId] = useState<number | null>(null);

  const contactId = open && contact ? contact.id : null;
  const { data: orders = [], isLoading } = useOrdersByContact(kind, contactId);
  const { data: payments = [] } = useContactDebtPayments(kind, contactId);
  const { data: freshContact } = useContact(kind, contactId);
  const delDebt = useDeleteDebtPayment();

  if (!contact) return null;

  const currentDebt = freshContact?.debt_amount ?? contact.debt_amount;
  const isCustomer = kind === "customer";
  const title = isCustomer
    ? `Phiếu bán của ${contact.name}`
    : `Phiếu nhập của ${contact.name}`;
  const verb = isCustomer ? "thu" : "trả";
  const paidLabel = isCustomer ? "Đã thu" : "Đã trả";
  const debtTableTitle = isCustomer ? "Phiếu thu nợ" : "Phiếu trả nợ";

  const handleDeletePayment = async (paymentId: number, amount: number) => {
    if (
      !confirm(
        `Xoá phiếu ${verb} nợ ${formatVND(amount)}?\nCông nợ sẽ được hoàn lại.`,
      )
    )
      return;
    try {
      await delDebt.mutateAsync(paymentId);
      toast.success("Đã xoá");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const orderTotalSum = orders.reduce((s, o) => s + o.total, 0);
  const orderPaidSum = orders.reduce((s, o) => s + o.paid, 0);
  const debtPaidSum = payments.reduce((s, p) => s + p.amount, 0);
  const totalPaid = orderPaidSum + debtPaidSum;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="p-6 text-neutral-500 text-sm">Đang tải...</div>
          ) : orders.length === 0 && payments.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-sm">
              Chưa có phiếu nào.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Phiếu mua/bán */}
              {orders.length > 0 && (
                <div className="border border-neutral-200 rounded-md">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Mã phiếu</TH>
                        <TH>Ngày</TH>
                        <TH className="text-center">Số dòng</TH>
                        <TH className="text-right">Tổng tiền</TH>
                        <TH className="text-right">{paidLabel}</TH>
                        <TH>Trạng thái</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {orders.map((o: OrderListRow) => {
                        const st = STATUS_LABEL[o.status];
                        return (
                          <TR
                            key={o.id}
                            onClick={() => setDetailId(o.id)}
                            className="cursor-pointer"
                          >
                            <TD className="font-mono text-xs">{o.code}</TD>
                            <TD className="text-neutral-600">
                              {formatDateTime(o.created_at)}
                            </TD>
                            <TD className="text-center">{o.item_count}</TD>
                            <TD className="text-right font-medium tabular-nums">
                              {formatVND(o.total)}
                            </TD>
                            <TD className="text-right text-neutral-600 tabular-nums">
                              {formatVND(o.paid)}
                            </TD>
                            <TD>
                              <span
                                className={cn(
                                  "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                                  st.tone,
                                )}
                              >
                                {st.text}
                              </span>
                            </TD>
                          </TR>
                        );
                      })}
                      <TR className="font-medium bg-neutral-50">
                        <TD colSpan={3}>
                          Tổng cộng ({orders.length} phiếu)
                        </TD>
                        <TD className="text-right tabular-nums">
                          {formatVND(orderTotalSum)}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {formatVND(orderPaidSum)}
                        </TD>
                        <TD />
                      </TR>
                    </TBody>
                  </Table>
                </div>
              )}

              {/* Phiếu thu nợ / trả nợ */}
              {payments.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-neutral-700 mb-1.5">
                    {debtTableTitle}
                  </div>
                  <div className="border border-neutral-200 rounded-md">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Ngày</TH>
                          <TH>Ghi chú</TH>
                          <TH className="text-right">Số tiền</TH>
                          <TH className="w-12"></TH>
                        </TR>
                      </THead>
                      <TBody>
                        {payments.map((p) => (
                          <TR key={p.id}>
                            <TD className="text-neutral-600 whitespace-nowrap">
                              {formatDateTime(p.created_at)}
                            </TD>
                            <TD className="text-neutral-600">
                              {p.note ?? p.category ?? "-"}
                            </TD>
                            <TD className="text-right tabular-nums">
                              {formatVND(p.amount)}
                            </TD>
                            <TD>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() =>
                                  handleDeletePayment(p.id, p.amount)
                                }
                                title="Xoá phiếu"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TD>
                          </TR>
                        ))}
                        <TR className="font-medium bg-neutral-50">
                          <TD colSpan={2}>
                            Tổng cộng ({payments.length} phiếu)
                          </TD>
                          <TD className="text-right tabular-nums">
                            {formatVND(debtPaidSum)}
                          </TD>
                          <TD />
                        </TR>
                      </TBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Tổng kết */}
              <div className="border border-neutral-200 rounded-md bg-neutral-50 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Tổng tiền hàng:</span>
                  <span className="tabular-nums">{formatVND(orderTotalSum)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    Đã {verb} khi {isCustomer ? "bán" : "nhập"}:
                  </span>
                  <span className="tabular-nums">{formatVND(orderPaidSum)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Đã {verb} nợ thêm:</span>
                  <span className="tabular-nums">{formatVND(debtPaidSum)}</span>
                </div>
                <div className="flex justify-between font-medium border-t border-neutral-200 pt-1.5">
                  <span>Tổng đã {verb}:</span>
                  <span className="tabular-nums text-green-700">
                    {formatVND(totalPaid)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Công nợ hiện tại:</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      currentDebt > 0 ? "text-amber-700" : "text-neutral-500",
                    )}
                  >
                    {formatVND(currentDebt)}
                  </span>
                </div>
              </div>
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
