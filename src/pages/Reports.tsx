import { useMemo, useState } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Abbr } from "@/components/ui/abbr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DayOrdersDialog } from "@/components/reports/DayOrdersDialog";
import {
  PeriodFilter,
  initialPeriod,
  periodToDates,
  type PeriodState,
} from "@/components/period-filter";
import {
  useDebtList,
  useProfitByProduct,
  useProfitLoss,
  useProfitTotal,
  useRevenueByDay,
  useRevenueTotal,
  useStockValuation,
} from "@/hooks/useReports";
import {
  cn,
  formatDate,
  formatNumber,
  formatPercent,
  formatVND,
} from "@/lib/utils";

export default function Reports() {
  // Period dùng chung cho Doanh thu + Lãi gộp, giữ nguyên khi đổi tab
  const [period, setPeriod] = useState<PeriodState>(() => initialPeriod("month"));

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Báo cáo</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Doanh thu, lãi gộp, tồn kho, công nợ
        </p>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList>
          <TabsTrigger value="pnl">Kết quả KD</TabsTrigger>
          <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
          <TabsTrigger value="profit">Lãi gộp</TabsTrigger>
          <TabsTrigger value="stock">Tồn kho</TabsTrigger>
          <TabsTrigger value="debt">Công nợ</TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <ProfitLossReportView period={period} setPeriod={setPeriod} />
        </TabsContent>
        <TabsContent value="revenue">
          <RevenueReport period={period} setPeriod={setPeriod} />
        </TabsContent>
        <TabsContent value="profit">
          <ProfitReport period={period} setPeriod={setPeriod} />
        </TabsContent>
        <TabsContent value="stock">
          <StockReport />
        </TabsContent>
        <TabsContent value="debt">
          <DebtReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type PeriodProps = {
  period: PeriodState;
  setPeriod: (p: PeriodState) => void;
};

/* ===== Kết quả kinh doanh (P&L) ===== */
function ProfitLossReportView({ period, setPeriod }: PeriodProps) {
  const { from, to } = useMemo(() => {
    const d = periodToDates(period);
    return { from: d.from ?? "", to: d.to ?? "" };
  }, [period]);
  const { data, isLoading } = useProfitLoss(from, to);

  return (
    <div className="space-y-3">
      <PeriodFilter value={period} onChange={setPeriod} />

      {isLoading || !data ? (
        <div className="p-12 text-center text-neutral-400 text-sm">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <PLStatement data={data} />
          <div className="space-y-3">
            <BreakdownTable
              title="Chi tiết chi phí"
              rows={data.expense_breakdown}
              tone="red"
              empty="Không có phiếu chi trong kỳ"
            />
            <BreakdownTable
              title="Chi tiết thu nhập khác"
              rows={data.other_income_breakdown}
              tone="green"
              empty="Không có phiếu thu trong kỳ"
            />
          </div>
        </div>
      )}
    </div>
  );
}

type PLData = NonNullable<ReturnType<typeof useProfitLoss>["data"]>;

function PLStatement({ data }: { data: PLData }) {
  const profitTone = data.net_profit >= 0 ? "text-green-700" : "text-red-700";
  return (
    <div className="border border-neutral-200 rounded-md bg-white">
      <Table>
        <TBody>
          <PLRow label="(1) Doanh thu bán hàng" value={data.revenue} />
          <PLRow
            label="(2) Giảm trừ doanh thu"
            value={-data.deductions}
            negative
          />
          <PLSub label="Chiết khấu hoá đơn" value={data.discount} />
          <PLSub label="Hàng KH trả lại" value={data.returns_value} />
          <PLRow
            label="(3) Doanh thu thuần"
            value={data.net_revenue}
            divider
            emphasis
          />
          <PLRow
            label="(4) Giá vốn hàng bán"
            value={-data.cogs}
            negative
            tooltip="Giá vốn đơn bán − giá vốn hàng KH trả lại"
          />
          <PLRow
            label="(5) Lợi nhuận gộp"
            value={data.gross_profit}
            divider
            emphasis
            tone={data.gross_profit >= 0 ? "green" : "red"}
          />
          <PLRow
            label="(6) Chi phí"
            value={-data.expenses}
            negative
            tooltip="Tổng phiếu chi nhập tay (không gồm thanh toán NCC, trả nợ)"
          />
          <PLRow
            label="(7) Lợi nhuận từ HĐKD"
            value={data.operating_profit}
            divider
            emphasis
            tone={data.operating_profit >= 0 ? "green" : "red"}
          />
          <PLRow
            label="(8) Thu nhập khác"
            value={data.other_income}
            tooltip="Tổng phiếu thu nhập tay (không gồm thu từ đơn bán, thu nợ)"
          />
          <TR className="border-t-2 border-neutral-300">
            <TD className="py-3 text-base font-semibold">
              (9) Lợi nhuận thuần
            </TD>
            <TD className={cn("py-3 text-right text-lg font-bold tabular-nums", profitTone)}>
              {formatVND(data.net_profit)}
            </TD>
          </TR>
        </TBody>
      </Table>
    </div>
  );
}

function PLRow({
  label,
  value,
  negative,
  divider,
  emphasis,
  tone,
  tooltip,
}: {
  label: string;
  value: number;
  negative?: boolean;
  divider?: boolean;
  emphasis?: boolean;
  tone?: "green" | "red";
  tooltip?: string;
}) {
  const valTone =
    tone === "green"
      ? "text-green-700"
      : tone === "red"
        ? "text-red-700"
        : negative
          ? "text-red-700"
          : "text-neutral-900";
  return (
    <TR className={cn(divider && "border-t border-neutral-200")}>
      <TD className={cn(emphasis ? "font-semibold" : "font-medium")}>
        {tooltip ? <Abbr title={tooltip}>{label}</Abbr> : label}
      </TD>
      <TD
        className={cn(
          "text-right tabular-nums",
          emphasis ? "font-semibold" : "",
          valTone,
        )}
      >
        {formatVND(value)}
      </TD>
    </TR>
  );
}

function PLSub({ label, value }: { label: string; value: number }) {
  return (
    <TR>
      <TD className="pl-8 text-sm text-neutral-500">{label}</TD>
      <TD className="text-right tabular-nums text-sm text-neutral-500">
        {formatVND(value)}
      </TD>
    </TR>
  );
}

function BreakdownTable({
  title,
  rows,
  tone,
  empty,
}: {
  title: string;
  rows: { category: string; amount: number }[];
  tone: "green" | "red";
  empty: string;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const valTone = tone === "green" ? "text-green-700" : "text-red-700";
  return (
    <div className="border border-neutral-200 rounded-md bg-white">
      <div className="px-3 py-2 border-b border-neutral-200 text-sm font-medium">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-neutral-400 text-sm">{empty}</div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Danh mục</TH>
              <TH className="text-right">Số tiền</TH>
              <TH className="text-right w-20">%</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => {
              const pct = total > 0 ? (r.amount / total) * 100 : 0;
              return (
                <TR key={r.category}>
                  <TD>{r.category}</TD>
                  <TD className={cn("text-right tabular-nums", valTone)}>
                    {formatVND(r.amount)}
                  </TD>
                  <TD className="text-right tabular-nums text-neutral-500 text-sm">
                    {formatPercent(pct)}
                  </TD>
                </TR>
              );
            })}
            <TR className="bg-neutral-50 font-medium">
              <TD>Tổng cộng</TD>
              <TD className={cn("text-right tabular-nums", valTone)}>
                {formatVND(total)}
              </TD>
              <TD />
            </TR>
          </TBody>
        </Table>
      )}
    </div>
  );
}

/* ===== Doanh thu theo ngày ===== */
function RevenueReport({ period, setPeriod }: PeriodProps) {
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const { from, to } = useMemo(() => {
    const d = periodToDates(period);
    return { from: d.from ?? "", to: d.to ?? "" };
  }, [period]);
  const { data = [] } = useRevenueByDay(from, to);
  const { data: allTime } = useRevenueTotal();

  const totals = data.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      orders: acc.orders + r.orders,
    }),
    { revenue: 0, orders: 0 },
  );

  return (
    <div className="space-y-3">
      <CumulativeBanner
        items={[
          { label: "Doanh thu tích lũy", value: formatVND(allTime?.revenue ?? 0) },
          { label: "Tổng đơn", value: String(allTime?.orders ?? 0) },
        ]}
        since={allTime?.first_order_date ?? null}
      />

      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-3">
        <Summary label="Doanh thu trong kỳ" value={formatVND(totals.revenue)} />
        <Summary label="Số đơn trong kỳ" value={String(totals.orders)} />
      </div>
      <div className="border border-neutral-200 rounded-md bg-white">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Ngày</TH>
                <TH className="text-right">Số đơn</TH>
                <TH className="text-right">Doanh thu</TH>
                <TH className="text-right">
                  <Abbr title="Doanh thu trung bình mỗi đơn">TB / đơn</Abbr>
                </TH>
              </TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR
                  key={r.date}
                  onClick={() => setPickedDate(r.date)}
                  className="cursor-pointer"
                >
                  <TD>{formatDate(r.date)}</TD>
                  <TD className="text-right tabular-nums">{r.orders}</TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatVND(r.revenue)}
                  </TD>
                  <TD className="text-right tabular-nums text-neutral-500">
                    {r.orders > 0 ? formatVND(r.revenue / r.orders) : "-"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <DayOrdersDialog
        open={pickedDate != null}
        onOpenChange={(o) => !o && setPickedDate(null)}
        date={pickedDate}
      />
    </div>
  );
}

/* ===== Lãi gộp theo SP ===== */
function ProfitReport({ period, setPeriod }: PeriodProps) {
  const { from, to } = useMemo(() => {
    const d = periodToDates(period);
    return { from: d.from ?? "", to: d.to ?? "" };
  }, [period]);
  const { data = [] } = useProfitByProduct(from, to);
  const { data: allTime } = useProfitTotal();

  const totals = data.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost_total,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  );
  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;
  const allMargin =
    allTime && allTime.revenue > 0 ? (allTime.profit / allTime.revenue) * 100 : 0;

  return (
    <div className="space-y-3">
      <CumulativeBanner
        items={[
          { label: "Doanh thu tích lũy", value: formatVND(allTime?.revenue ?? 0) },
          { label: "Giá vốn tích lũy", value: formatVND(allTime?.cost ?? 0) },
          {
            label: "Lãi gộp tích lũy",
            value: formatVND(allTime?.profit ?? 0),
            tone: (allTime?.profit ?? 0) >= 0 ? "green" : "red",
          },
          {
            label: "Biên lãi",
            value: formatPercent(allMargin),
            tone: allMargin >= 0 ? "green" : "red",
          },
        ]}
      />

      <PeriodFilter value={period} onChange={setPeriod} />
      <div className="grid grid-cols-4 gap-3">
        <Summary label="Doanh thu trong kỳ" value={formatVND(totals.revenue)} />
        <Summary
          label="Giá vốn trong kỳ"
          value={formatVND(totals.cost)}
          tooltip="Tổng giá nhập của các SP đã bán trong kỳ"
        />
        <Summary
          label="Lãi gộp trong kỳ"
          value={formatVND(totals.profit)}
          tone={totals.profit >= 0 ? "green" : "red"}
          tooltip="= Doanh thu − Giá vốn (chưa trừ chi phí khác như điện, lương...)"
        />
        <Summary
          label="Biên lãi trong kỳ"
          value={formatPercent(margin)}
          tone={margin >= 0 ? "green" : "red"}
          tooltip="= Lãi gộp / Doanh thu × 100%"
        />
      </div>
      <div className="border border-neutral-200 rounded-md bg-white">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Mã sản phẩm</TH>
                <TH>Sản phẩm</TH>
                <TH className="text-right">
                  <Abbr title="Số lượng bán (theo đơn vị cơ bản)">SL bán</Abbr>
                </TH>
                <TH>
                  <Abbr title="Đơn vị cơ bản">ĐV</Abbr>
                </TH>
                <TH className="text-right">Doanh thu</TH>
                <TH className="text-right">
                  <Abbr title="Giá vốn - Giá nhập hàng">Giá vốn</Abbr>
                </TH>
                <TH className="text-right">
                  <Abbr title="Lãi gộp = Doanh thu − Giá vốn">Lãi gộp</Abbr>
                </TH>
                <TH className="text-right">
                  <Abbr title="Biên lãi = Lãi gộp / Doanh thu">Biên %</Abbr>
                </TH>
              </TR>
            </THead>
            <TBody>
              {data.map((r) => {
                const m = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
                return (
                  <TR key={r.product_id}>
                    <TD className="font-mono text-xs">{r.sku}</TD>
                    <TD className="font-medium">{r.name}</TD>
                    <TD className="text-right tabular-nums">
                      {formatNumber(r.qty_sold)}
                    </TD>
                    <TD className="text-neutral-600">{r.base_unit}</TD>
                    <TD className="text-right tabular-nums">{formatVND(r.revenue)}</TD>
                    <TD className="text-right tabular-nums text-neutral-500">
                      {formatVND(r.cost_total)}
                    </TD>
                    <TD
                      className={cn(
                        "text-right tabular-nums font-medium",
                        r.profit >= 0 ? "text-green-700" : "text-red-700",
                      )}
                    >
                      {formatVND(r.profit)}
                    </TD>
                    <TD
                      className={cn(
                        "text-right tabular-nums",
                        m >= 0 ? "text-green-700" : "text-red-700",
                      )}
                    >
                      {formatPercent(m)}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/* ===== Tồn kho ===== */
function StockReport() {
  const { data = [] } = useStockValuation();
  const totalValue = data.reduce((s, r) => s + r.value, 0);
  const totalQty = data.reduce((s, r) => s + r.stock_qty, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Summary label="Số SP" value={String(data.length)} />
        <Summary label="Tổng tồn" value={formatNumber(totalQty)} />
        <Summary label="Giá trị tồn" value={formatVND(totalValue)} />
      </div>
      <div className="border border-neutral-200 rounded-md bg-white">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Mã sản phẩm</TH>
                <TH>Sản phẩm</TH>
                <TH className="text-right">
                  <Abbr title="Số lượng còn trong kho">Tồn</Abbr>
                </TH>
                <TH className="text-right">Giá vốn</TH>
                <TH className="text-right">
                  <Abbr title="Tổng giá trị = Tồn × Giá vốn">Giá trị</Abbr>
                </TH>
              </TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.variant_id}>
                  <TD className="font-mono text-xs">{r.sku}</TD>
                  <TD className="font-medium">{r.name}</TD>
                  <TD
                    className={cn(
                      "text-right tabular-nums",
                      r.stock_qty <= 0 && "text-red-600 font-medium",
                    )}
                  >
                    {formatNumber(r.stock_qty)} {r.unit}
                  </TD>
                  <TD className="text-right tabular-nums text-neutral-500">
                    {formatVND(r.price_cost)}
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    {formatVND(r.value)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/* ===== Công nợ ===== */
function DebtReport() {
  const [kind, setKind] = useState<"customer" | "supplier">("customer");
  const { data = [] } = useDebtList(kind);
  const total = data.reduce((s, r) => s + r.debt_amount, 0);

  return (
    <div className="space-y-3">
      <Tabs value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
        <TabsList>
          <TabsTrigger value="customer">Phải thu (KH)</TabsTrigger>
          <TabsTrigger value="supplier">Phải trả (NCC)</TabsTrigger>
        </TabsList>
      </Tabs>
      <Summary
        label={kind === "customer" ? "Tổng phải thu" : "Tổng phải trả"}
        value={formatVND(total)}
        tone="amber"
      />
      <div className="border border-neutral-200 rounded-md bg-white">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Tên</TH>
                <TH>SĐT</TH>
                <TH className="text-right">Số tiền</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="text-neutral-500">{r.phone ?? "-"}</TD>
                  <TD className="text-right tabular-nums font-medium text-amber-700">
                    {formatVND(r.debt_amount)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function Summary({
  label,
  value,
  tone = "neutral",
  tooltip,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "amber";
  tooltip?: string;
}) {
  const toneClass = {
    neutral: "text-neutral-900",
    green: "text-green-700",
    red: "text-red-700",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className="border border-neutral-200 rounded-md p-3 bg-white">
      <div className="text-xs text-neutral-500">
        {tooltip ? <Abbr title={tooltip}>{label}</Abbr> : label}
      </div>
      <div className={cn("text-xl font-semibold tabular-nums mt-1", toneClass)}>
        {value}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="p-12 text-center text-neutral-400 text-sm">
      Không có dữ liệu trong khoảng thời gian này.
    </div>
  );
}

type BannerItem = {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "amber";
};

function CumulativeBanner({
  items,
  since,
}: {
  items: BannerItem[];
  since?: string | null;
}) {
  return (
    <div className="border border-brand-100 bg-brand-50/40 rounded-md px-4 py-3">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <span className="text-xs font-medium text-brand-700 uppercase tracking-wide">
          Tích lũy toàn bộ
        </span>
        {since && (
          <span className="text-xs text-neutral-500">
            Từ {formatDate(since)}
          </span>
        )}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const toneClass = {
            neutral: "text-neutral-900",
            green: "text-green-700",
            red: "text-red-700",
            amber: "text-amber-700",
          }[it.tone ?? "neutral"];
          return (
            <div key={it.label}>
              <div className="text-xs text-neutral-500">{it.label}</div>
              <div className={cn("text-lg font-semibold tabular-nums mt-0.5", toneClass)}>
                {it.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
