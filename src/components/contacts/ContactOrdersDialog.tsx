import { useMemo, useState } from "react";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { AdjustDebtDialog } from "./AdjustDebtDialog";
import { EditCashDateDialog } from "@/components/cash/EditCashDateDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrdersByContact } from "@/hooks/useOrders";
import { useContactCashFlow, useDeleteCashTransaction } from "@/hooks/useCash";
import {
  useContact,
  useDebtAdjustments,
  useDeleteDebtAdjustment,
} from "@/hooks/useContacts";
import { useSettings } from "@/hooks/useSettings";
import { exportContactStatementToExcel } from "@/lib/excelExport";
import { cn, formatDateTime, formatVND } from "@/lib/utils";
import type { Contact, ContactKind, DebtAdjustment } from "@/db/contacts";
import type { CashRow } from "@/db/cash";
import type { OrderListRow } from "@/db/orders";
import type { CashTransaction, OrderType } from "@/domain/types";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact: Contact | null;
};

type TimelineRow =
  | { rowKind: "order"; data: OrderListRow }
  | { rowKind: "cash"; data: CashTransaction }
  | { rowKind: "adjust"; data: DebtAdjustment };

function rowCreatedAt(r: TimelineRow): string {
  return r.data.created_at;
}

function valueOf(r: TimelineRow, kind: ContactKind): number {
  if (r.rowKind === "order") {
    // sale/purchase tăng nợ, return giảm nợ
    return r.data.type === "return" ? -r.data.total : r.data.total;
  }
  if (r.rowKind === "adjust") {
    // Điều chỉnh: change_amount đã là delta dư nợ (dương = tăng nợ)
    return r.data.change_amount;
  }
  // cash: chiều giảm nợ tùy loại đối tác
  const reducesDebt =
    (kind === "customer" && r.data.type === "in") ||
    (kind === "supplier" && r.data.type === "out");
  return reducesDebt ? -r.data.amount : r.data.amount;
}

const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  sale: "Bán hàng",
  purchase: "Nhập hàng",
  return: "Trả hàng",
};

/**
 * Loại + tone cho từng dòng timeline.
 * - Order: theo type
 * - Cash: theo chiều dòng tiền so với contact:
 *   + chiều giảm nợ (KH trả mình / mình trả NCC) = "Thanh toán"
 *   + chiều tăng nợ (mình hoàn KH / NCC hoàn mình) = "Hoàn tiền"
 */
function rowTypeInfo(
  row: TimelineRow,
  kind: ContactKind,
): { label: string; tone: string } {
  if (row.rowKind === "order") {
    if (row.data.type === "return") {
      return { label: "Trả hàng", tone: "bg-amber-50 text-amber-700" };
    }
    return { label: ORDER_TYPE_LABEL[row.data.type], tone: "bg-blue-50 text-blue-700" };
  }
  if (row.rowKind === "adjust") {
    return { label: "Điều chỉnh nợ", tone: "bg-purple-50 text-purple-700" };
  }
  const isPayment =
    (kind === "customer" && row.data.type === "in") ||
    (kind === "supplier" && row.data.type === "out");
  return isPayment
    ? { label: "Thanh toán", tone: "bg-green-50 text-green-700" }
    : { label: "Hoàn tiền", tone: "bg-orange-50 text-orange-700" };
}

export function ContactOrdersDialog({
  open,
  onOpenChange,
  kind,
  contact,
}: Props) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editingCash, setEditingCash] = useState<CashRow | null>(null);
  const [editingAdjustment, setEditingAdjustment] =
    useState<DebtAdjustment | null>(null);
  const [pendingDeleteCash, setPendingDeleteCash] = useState<{
    cash: CashTransaction;
    title: string;
    message: string;
  } | null>(null);

  const contactId = open && contact ? contact.id : null;
  const { data: orders = [], isLoading: loadingOrders } = useOrdersByContact(
    kind,
    contactId,
  );
  const { data: cashFlow = [], isLoading: loadingCash } = useContactCashFlow(
    kind,
    contactId,
  );
  const { data: adjustments = [], isLoading: loadingAdj } = useDebtAdjustments(
    kind,
    contactId,
  );
  const { data: freshContact } = useContact(kind, contactId);
  const { data: settings } = useSettings();
  const deleteAdjustment = useDeleteDebtAdjustment();
  const deleteCash = useDeleteCashTransaction();
  const [exporting, setExporting] = useState(false);

  const orderByIdMap = useMemo(
    () => new Map(orders.map((o) => [o.id, o])),
    [orders],
  );

  // Sắp theo thời gian tăng dần, tính running balance, rồi đảo lại để hiển thị mới nhất trên cùng
  const rowsWithBalance = useMemo(() => {
    const all: TimelineRow[] = [
      ...orders.map<TimelineRow>((o) => ({ rowKind: "order", data: o })),
      ...cashFlow.map<TimelineRow>((c) => ({ rowKind: "cash", data: c })),
      ...adjustments.map<TimelineRow>((a) => ({ rowKind: "adjust", data: a })),
    ];
    all.sort((a, b) => (rowCreatedAt(a) < rowCreatedAt(b) ? -1 : 1));

    let running = 0;
    const withBal = all.map((r) => {
      const value = valueOf(r, kind);
      running += value;
      return { row: r, value, balance: running };
    });
    return withBal.reverse();
  }, [orders, cashFlow, adjustments, kind]);

  if (!contact) return null;

  const isCustomer = kind === "customer";
  const title = isCustomer
    ? `Sổ giao dịch khách hàng — ${contact.name}`
    : `Sổ giao dịch nhà cung cấp — ${contact.name}`;

  const currentDebt = freshContact?.debt_amount ?? contact.debt_amount;
  const totalBills = orders
    .filter((o) => o.type !== "return")
    .reduce((s, o) => s + o.total, 0);
  const totalReturns = orders
    .filter((o) => o.type === "return")
    .reduce((s, o) => s + o.total, 0);
  const totalPaid = cashFlow.reduce((s, t) => {
    const reducesDebt =
      (kind === "customer" && t.type === "in") ||
      (kind === "supplier" && t.type === "out");
    return s + (reducesDebt ? t.amount : -t.amount);
  }, 0);

  const isLoading = loadingOrders || loadingCash || loadingAdj;

  const handleDeleteAdjustment = async (adj: DebtAdjustment) => {
    if (
      !confirm(
        `Xoá phiếu điều chỉnh "${adj.code}"?\nDư nợ sẽ được hoàn về giá trị trước khi điều chỉnh.`,
      )
    )
      return;
    try {
      await deleteAdjustment.mutateAsync(adj.id);
      toast.success("Đã xoá phiếu điều chỉnh");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteCash = (cash: CashTransaction) => {
    const amount = formatVND(cash.amount);
    let title: string;
    let message: string;
    if (cash.ref_table === "customers" || cash.ref_table === "suppliers") {
      title = `Xoá phiếu ${cash.type === "in" ? "thu" : "trả"} nợ?`;
      message = `${cash.category ?? ""} - ${amount}\nCông nợ sẽ được hoàn lại.`;
    } else if (cash.ref_table === "orders") {
      const code = cash.ref_id ? orderByIdMap.get(cash.ref_id)?.code ?? "" : "";
      title = `Xoá phiếu ${cash.type === "in" ? "thu" : "chi"} từ đơn hàng?`;
      message =
        `${cash.category ?? ""} - ${amount}\n` +
        `Đơn hàng ${code} sẽ giảm "Đã thanh toán" tương ứng.\n` +
        `Công nợ tự đồng bộ. Đơn hàng KHÔNG bị huỷ.`;
    } else {
      title = "Xoá giao dịch?";
      message = `${cash.category ?? ""} - ${amount}`;
    }
    setPendingDeleteCash({ cash, title, message });
  };

  const confirmDeleteCash = async () => {
    if (!pendingDeleteCash) return;
    try {
      await deleteCash.mutateAsync(pendingDeleteCash.cash.id);
      toast.success("Đã xoá phiếu");
      setPendingDeleteCash(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleExport = async () => {
    if (!contact) return;
    setExporting(true);
    const toastId = toast.loading("Đang xuất Excel...");
    try {
      const res = await exportContactStatementToExcel({
        kind,
        contact: freshContact ?? contact,
        orders,
        cashFlow,
        settings,
      });
      if (res.ok) {
        toast.success(`Đã xuất: ${res.path}`, { id: toastId });
      } else if (res.reason === "cancelled") {
        toast.dismiss(toastId);
      } else {
        toast.error(`Lỗi xuất Excel: ${res.message}`, { id: toastId });
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>{title}</DialogTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={exporting || rowsWithBalance.length === 0}
                className="mr-6"
                title="Xuất công nợ chi tiết ra Excel"
              >
                <FileSpreadsheet className="w-4 h-4" />
                {exporting ? "Đang xuất..." : "Xuất Excel"}
              </Button>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="p-6 text-neutral-500 text-sm">Đang tải...</div>
          ) : rowsWithBalance.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-sm">
              Chưa có giao dịch nào.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border border-neutral-200 rounded-md">
                <Table>
                  <THead className="sticky top-0 z-10">
                    <TR>
                      <TH>Mã phiếu</TH>
                      <TH>Thời gian</TH>
                      <TH>Loại</TH>
                      <TH className="text-right">Giá trị</TH>
                      <TH className="text-right">Dư nợ</TH>
                      <TH className="w-10"></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rowsWithBalance.map(({ row, value, balance }) => {
                      const isOrder = row.rowKind === "order";
                      const isAdjust = row.rowKind === "adjust";
                      const code = isOrder
                        ? row.data.code
                        : isAdjust
                          ? row.data.code
                          : row.data.ref_table === "orders" && row.data.ref_id
                            ? `→ ${orderByIdMap.get(row.data.ref_id)?.code ?? "—"}`
                            : row.data.ref_table === "customers"
                              ? "(Thu nợ)"
                              : row.data.ref_table === "suppliers"
                                ? "(Trả nợ)"
                                : "—";
                      const typeInfo = rowTypeInfo(row, kind);
                      const key = isOrder
                        ? `o-${row.data.id}`
                        : isAdjust
                          ? `a-${row.data.id}`
                          : `c-${row.data.id}`;
                      const orderRow = isOrder ? row.data : null;

                      const handleRowClick = () => {
                        if (isOrder && orderRow) {
                          setDetailId(orderRow.id);
                        } else if (row.rowKind === "cash") {
                          // Build CashRow với source_label cho dialog
                          const cash = row.data;
                          let sourceLabel: string | null = null;
                          if (cash.ref_table === "orders" && cash.ref_id) {
                            sourceLabel =
                              orderByIdMap.get(cash.ref_id)?.code ?? null;
                          } else if (cash.ref_table === "customers") {
                            sourceLabel = "Thu nợ KH";
                          } else if (cash.ref_table === "suppliers") {
                            sourceLabel = "Trả nợ NCC";
                          }
                          setEditingCash({ ...cash, source_label: sourceLabel });
                        } else if (row.rowKind === "adjust") {
                          setEditingAdjustment(row.data);
                        }
                      };

                      return (
                        <TR
                          key={key}
                          onClick={handleRowClick}
                          className="cursor-pointer"
                          title={
                            isOrder
                              ? "Click xem chi tiết phiếu"
                              : isAdjust
                                ? "Click sửa phiếu điều chỉnh"
                                : "Click sửa giao dịch (số tiền + ngày giờ)"
                          }
                        >
                          <TD
                            className={cn(
                              "font-mono text-xs",
                              (!isOrder || isAdjust) && "text-neutral-500 italic",
                            )}
                          >
                            {code}
                          </TD>
                          <TD className="text-neutral-600 whitespace-nowrap">
                            {formatDateTime(rowCreatedAt(row))}
                          </TD>
                          <TD>
                            <span
                              className={cn(
                                "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                                typeInfo.tone,
                              )}
                            >
                              {typeInfo.label}
                            </span>
                          </TD>
                          <TD
                            className={cn(
                              "text-right tabular-nums font-medium",
                              value > 0
                                ? "text-neutral-800"
                                : value < 0
                                  ? "text-green-700"
                                  : "text-neutral-500",
                            )}
                          >
                            {value > 0 ? "+" : value < 0 ? "−" : ""}
                            {formatVND(Math.abs(value))}
                          </TD>
                          <TD
                            className={cn(
                              "text-right tabular-nums",
                              balance > 0
                                ? "text-amber-700 font-medium"
                                : balance < 0
                                  ? "text-green-700"
                                  : "text-neutral-500",
                            )}
                          >
                            {formatVND(balance)}
                          </TD>
                          <TD onClick={(e) => e.stopPropagation()}>
                            {isAdjust ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteAdjustment(row.data)}
                                title="Xoá phiếu điều chỉnh"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : row.rowKind === "cash" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteCash(row.data)}
                                title="Xoá phiếu thu/chi"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              {/* Tổng kết */}
              <div className="border border-neutral-200 rounded-md bg-neutral-50 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    Tổng tiền hàng ({isCustomer ? "đã bán" : "đã nhập"}):
                  </span>
                  <span className="tabular-nums">{formatVND(totalBills)}</span>
                </div>
                {totalReturns > 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Tổng trả hàng:</span>
                    <span className="tabular-nums text-amber-700">
                      −{formatVND(totalReturns)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    Tổng đã {isCustomer ? "thu" : "trả"}:
                  </span>
                  <span className="tabular-nums text-green-700">
                    {formatVND(totalPaid)}
                  </span>
                </div>
                <div className="flex justify-between font-medium border-t border-neutral-200 pt-1.5">
                  <span>Dư nợ hiện tại:</span>
                  <span
                    className={cn(
                      "tabular-nums",
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

      <EditCashDateDialog
        open={editingCash != null}
        onOpenChange={(o) => !o && setEditingCash(null)}
        transaction={editingCash}
      />

      <AdjustDebtDialog
        open={editingAdjustment != null}
        onOpenChange={(o) => !o && setEditingAdjustment(null)}
        kind={kind}
        contact={contact}
        adjustment={editingAdjustment}
      />

      <ConfirmDialog
        open={pendingDeleteCash != null}
        onOpenChange={(v) => !v && setPendingDeleteCash(null)}
        title={pendingDeleteCash?.title ?? "Xoá giao dịch?"}
        message={pendingDeleteCash?.message}
        confirmLabel="Xoá"
        destructive
        busy={deleteCash.isPending}
        onConfirm={confirmDeleteCash}
      />
    </>
  );
}
