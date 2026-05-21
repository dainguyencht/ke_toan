import { useMemo, useState } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CashTransactionForm } from "@/components/cash/CashTransactionForm";
import {
  useCashSummary,
  useCashTransactions,
  useDeleteCashTransaction,
} from "@/hooks/useCash";
import { cn, daysAgo, formatDateTime, formatVND } from "@/lib/utils";
import type { CashFilter, CashRow } from "@/db/cash";
import { toast } from "sonner";

type PresetRange = "today" | "7d" | "30d" | "all";

const PRESETS: Record<PresetRange, { label: string; from: string | null }> = {
  today: { label: "Hôm nay", from: daysAgo(0) },
  "7d": { label: "7 ngày", from: daysAgo(6) },
  "30d": { label: "30 ngày", from: daysAgo(29) },
  all: { label: "Tất cả", from: null },
};

export default function CashBook() {
  const [range, setRange] = useState<PresetRange>("30d");
  const [typeFilter, setTypeFilter] = useState<"all" | "in" | "out">("all");
  const [openForm, setOpenForm] = useState(false);
  const [editTx, setEditTx] = useState<CashRow | null>(null);

  const filter = useMemo<CashFilter>(
    () => ({
      from: PRESETS[range].from,
      type: typeFilter,
    }),
    [range, typeFilter],
  );

  const { data: summary } = useCashSummary(filter);
  const { data: transactions, isLoading } = useCashTransactions(filter);
  const { data: allTime } = useCashSummary({});
  const del = useDeleteCashTransaction();

  const handleDelete = async (id: number, label: string) => {
    if (!confirm(`Xóa giao dịch "${label}"?`)) return;
    try {
      await del.mutateAsync(id);
      toast.success("Đã xóa");
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
        <Button
          onClick={() => {
            setEditTx(null);
            setOpenForm(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Ghi thu/chi
        </Button>
      </div>

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
        <Tabs value={range} onValueChange={(v) => setRange(v as PresetRange)}>
          <TabsList>
            {(Object.keys(PRESETS) as PresetRange[]).map((k) => (
              <TabsTrigger key={k} value={k}>
                {PRESETS[k].label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
                    {!t.ref_table && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditTx(t);
                            setOpenForm(true);
                          }}
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() =>
                            handleDelete(t.id, `${t.category} - ${formatVND(t.amount)}`)
                          }
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <CashTransactionForm
        open={openForm}
        onOpenChange={(v) => {
          setOpenForm(v);
          if (!v) setEditTx(null);
        }}
        editTransaction={editTx}
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
