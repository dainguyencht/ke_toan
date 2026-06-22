import { useMemo, useState } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashTransactionForm } from "@/components/cash/CashTransactionForm";
import { CategoryManager } from "@/components/cash/CategoryManager";
import { EditCashDateDialog } from "@/components/cash/EditCashDateDialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  PeriodFilter,
  initialPeriod,
  periodToDates,
  type PeriodMode,
  type PeriodState,
} from "@/components/period-filter";
import {
  useCashSummary,
  useCashTransactions,
  useDeleteCashTransaction,
} from "@/hooks/useCash";
import { cn, formatDateTime, formatVND } from "@/lib/utils";
import type { CashFilter, CashRow } from "@/db/cash";
import { toast } from "sonner";

const CASH_MODES: PeriodMode[] = [
  "day",
  "month",
  "quarter",
  "year",
  "custom",
  "all",
];

export default function CashBook() {
  const [tab, setTab] = useState<"transactions" | "categories">("transactions");
  const [period, setPeriod] = useState<PeriodState>(() => initialPeriod("month"));
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [openForm, setOpenForm] = useState(false);
  const [editTx, setEditTx] = useState<CashRow | null>(null);
  const [dateEditTx, setDateEditTx] = useState<CashRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    tx: CashRow;
    title: string;
    message: string;
  } | null>(null);

  const filter = useMemo<CashFilter>(() => {
    const { from, to } = periodToDates(period);
    return { from, to, type: typeFilter };
  }, [period, typeFilter]);

  const { data: summary } = useCashSummary(filter);
  const { data: transactions, isLoading } = useCashTransactions(filter);
  const { data: allTime } = useCashSummary({});
  const del = useDeleteCashTransaction();

  const handleDelete = (t: CashRow) => {
    const label = `${t.category} - ${formatVND(t.amount)}`;
    let title: string;
    let message: string;
    if (t.ref_table === "customers" || t.ref_table === "suppliers") {
      title = `Xoá phiếu ${t.type === "in" ? "thu" : "trả"} nợ?`;
      message = `${label}\nCông nợ sẽ được hoàn lại.`;
    } else if (t.ref_table === "orders") {
      title = `Xoá phiếu ${t.type === "in" ? "thu" : "chi"} từ đơn hàng?`;
      message =
        `${label}\n` +
        `Đơn hàng ${t.source_label ?? ""} sẽ giảm "Đã thanh toán" tương ứng.\n` +
        `Công nợ KH/NCC sẽ tự đồng bộ. Đơn hàng KHÔNG bị huỷ.`;
    } else {
      title = "Xoá giao dịch?";
      message = label;
    }
    setPendingDelete({ tx: t, title, message });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await del.mutateAsync(pendingDelete.tx.id);
      toast.success("Đã xóa");
      setPendingDelete(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sổ quỹ</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Thu/chi tiền mặt, tự động ghi từ đơn hàng + ghi tay
          </p>
        </div>
        {tab === "transactions" && (
          <Button
            onClick={() => {
              setEditTx(null);
              setOpenForm(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Ghi thu/chi
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="transactions">Giao dịch</TabsTrigger>
          <TabsTrigger value="categories">Danh mục</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="mt-4">
          <CategoryManager />
        </TabsContent>

        <TabsContent value="transactions" className="mt-4 space-y-4">

      {/* Tồn quỹ tích lũy */}
      <div
        className={cn(
          "border rounded-md p-3 text-sm flex items-center gap-2",
          (allTime?.balance ?? 0) >= 0
            ? "border-green-200 bg-green-50 text-green-800"
            : "border-red-200 bg-red-50 text-red-800",
        )}
      >
        <Wallet className="w-4 h-4" />
        <span>
          Tồn quỹ tích lũy:{" "}
          <strong>{formatVND(allTime?.balance ?? 0)}</strong>
        </span>
      </div>

      {/* 3 card summary cho kỳ */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label={`Thu trong kỳ`}
          value={summary?.total_in ?? 0}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="green"
        />
        <SummaryCard
          label="Chi trong kỳ"
          value={summary?.total_out ?? 0}
          icon={<TrendingDown className="w-5 h-5" />}
          tone="red"
        />
        <SummaryCard
          label="Chênh lệch kỳ"
          value={summary?.balance ?? 0}
          icon={<Wallet className="w-5 h-5" />}
          tone={(summary?.balance ?? 0) >= 0 ? "green" : "red"}
        />
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PeriodFilter value={period} onChange={setPeriod} modes={CASH_MODES} />
        <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
          <TabsList>
            <TabsTrigger value="all">Tất cả</TabsTrigger>
            <TabsTrigger value="in">Chỉ thu</TabsTrigger>
            <TabsTrigger value="out">Chỉ chi</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Bảng giao dịch */}
      <div className="border border-neutral-200 rounded-md bg-white">
        {isLoading ? (
          <div className="p-6 text-neutral-500">Đang tải...</div>
        ) : !transactions?.length ? (
          <div className="p-12 text-center text-neutral-500">
            Không có giao dịch trong khoảng thời gian này.
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Thời gian</TH>
                <TH>Loại</TH>
                <TH>Danh mục</TH>
                <TH>Nguồn</TH>
                <TH>Ghi chú</TH>
                <TH className="text-right">Số tiền</TH>
                <TH className="w-12"></TH>
              </TR>
            </THead>
            <TBody>
              {transactions.map((t) => (
                <TR key={t.id}>
                  <TD className="text-neutral-600 text-xs whitespace-nowrap">
                    {formatDateTime(t.created_at)}
                  </TD>
                  <TD>
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded text-xs font-medium",
                        t.type === "in"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700",
                      )}
                    >
                      {t.type === "in" ? "Thu" : "Chi"}
                    </span>
                  </TD>
                  <TD>{t.category ?? "-"}</TD>
                  <TD className="text-xs text-neutral-500">
                    <span className={t.source_label ? "font-mono" : ""}>
                      {t.source_label ?? "Nhập tay"}
                    </span>
                  </TD>
                  <TD className="text-neutral-600 max-w-xs truncate">
                    {t.note ?? "-"}
                  </TD>
                  <TD
                    className={cn(
                      "text-right font-medium",
                      t.type === "in" ? "text-green-700" : "text-red-700",
                    )}
                  >
                    {t.type === "in" ? "+" : "−"}
                    {formatVND(t.amount)}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          if (t.ref_table) {
                            setDateEditTx(t);
                          } else {
                            setEditTx(t);
                            setOpenForm(true);
                          }
                        }}
                        title={t.ref_table ? "Sửa ngày giờ" : "Sửa"}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(t)}
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

        </TabsContent>
      </Tabs>

      <CashTransactionForm
        open={openForm}
        onOpenChange={(v) => {
          setOpenForm(v);
          if (!v) setEditTx(null);
        }}
        editTransaction={editTx}
      />
      <EditCashDateDialog
        open={dateEditTx != null}
        onOpenChange={(v) => !v && setDateEditTx(null)}
        transaction={dateEditTx}
      />
      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title={pendingDelete?.title ?? "Xoá giao dịch?"}
        message={pendingDelete?.message}
        confirmLabel="Xoá"
        destructive
        busy={del.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "green" | "red";
}) {
  return (
    <div className="border border-neutral-200 rounded-md p-4 bg-white">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-500">{label}</span>
        <span
          className={cn(
            "p-1.5 rounded",
            tone === "green" ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600",
          )}
        >
          {icon}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 text-2xl font-semibold tabular-nums",
          tone === "green" ? "text-green-700" : "text-red-700",
        )}
      >
        {formatVND(value)}
      </div>
    </div>
  );
}
