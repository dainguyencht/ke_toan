import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Abbr } from "@/components/ui/abbr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DayOrdersDialog } from "@/components/reports/DayOrdersDialog";
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
  daysAgo,
  formatDate,
  formatNumber,
  formatPercent,
  formatVND,
  toISODate,
} from "@/lib/utils";

type PeriodMode = "day" | "7d" | "30d" | "month" | "quarter" | "year" | "custom";

type PeriodState = {
  mode: PeriodMode;
  /** Mốc thời gian trong period (chỉ dùng cho day/month/quarter/year) */
  anchor: Date;
  customFrom: string; // YYYY-MM-DD
  customTo: string;
};

const MODE_LABELS: Record<PeriodMode, string> = {
  day: "Ngày",
  month: "Tháng",
  quarter: "Quý",
  year: "Năm",
  custom: "Tuỳ chỉnh",
  "7d": "7 ngày",
  "30d": "30 ngày",
};

function initialPeriod(mode: PeriodMode = "30d"): PeriodState {
  const today = toISODate(new Date());
  return { mode, anchor: new Date(), customFrom: today, customTo: today };
}

function periodToDates(p: PeriodState): { from: string; to: string } {
  const a = p.anchor;
  switch (p.mode) {
    case "day": {
      const d = toISODate(a);
      return { from: d, to: d };
    }
    case "7d":
      return { from: daysAgo(6), to: daysAgo(0) };
    case "30d":
      return { from: daysAgo(29), to: daysAgo(0) };
    case "month": {
      const from = new Date(a.getFullYear(), a.getMonth(), 1);
      const to = new Date(a.getFullYear(), a.getMonth() + 1, 0);
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "quarter": {
      const q = Math.floor(a.getMonth() / 3);
      const from = new Date(a.getFullYear(), q * 3, 1);
      const to = new Date(a.getFullYear(), q * 3 + 3, 0);
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "year": {
      const from = new Date(a.getFullYear(), 0, 1);
      const to = new Date(a.getFullYear(), 11, 31);
      return { from: toISODate(from), to: toISODate(to) };
    }
    case "custom":
      return { from: p.customFrom, to: p.customTo };
  }
}

function shiftPeriod(p: PeriodState, delta: -1 | 1): PeriodState {
  const a = new Date(p.anchor);
  switch (p.mode) {
    case "day":
      a.setDate(a.getDate() + delta);
      break;
    case "month":
      a.setMonth(a.getMonth() + delta);
      break;
    case "quarter":
      a.setMonth(a.getMonth() + 3 * delta);
      break;
    case "year":
      a.setFullYear(a.getFullYear() + delta);
      break;
    default:
      return p;
  }
  return { ...p, anchor: a };
}

/** Period kế tiếp đã ở tương lai? Dùng để disable nút "Next". */
function isAtOrAfterCurrentPeriod(p: PeriodState): boolean {
  const now = new Date();
  switch (p.mode) {
    case "day":
      return toISODate(p.anchor) >= toISODate(now);
    case "month": {
      const ay = p.anchor.getFullYear();
      const am = p.anchor.getMonth();
      return ay > now.getFullYear() ||
        (ay === now.getFullYear() && am >= now.getMonth());
    }
    case "quarter": {
      const ay = p.anchor.getFullYear();
      const aq = Math.floor(p.anchor.getMonth() / 3);
      const nq = Math.floor(now.getMonth() / 3);
      return ay > now.getFullYear() ||
        (ay === now.getFullYear() && aq >= nq);
    }
    case "year":
      return p.anchor.getFullYear() >= now.getFullYear();
    default:
      return true;
  }
}

export default function Reports() {
  // Period dùng chung cho Doanh thu + Lãi gộp, giữ nguyên khi đổi tab
  const [period, setPeriod] = useState<PeriodState>(() => initialPeriod("30d"));

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
  const { from, to } = useMemo(() => periodToDates(period), [period]);
  const { data, isLoading } = useProfitLoss(from, to);

  return (
    <div className="space-y-3">
      <RangeFilter value={period} onChange={setPeriod} />

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
  const { from, to } = useMemo(() => periodToDates(period), [period]);
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

      <RangeFilter value={period} onChange={setPeriod} />
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
  const { from, to } = useMemo(() => periodToDates(period), [period]);
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

      <RangeFilter value={period} onChange={setPeriod} />
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

/* ===== Helpers ===== */
function RangeFilter({
  value,
  onChange,
}: {
  value: PeriodState;
  onChange: (v: PeriodState) => void;
}) {
  const showShift =
    value.mode === "day" ||
    value.mode === "month" ||
    value.mode === "quarter" ||
    value.mode === "year";
  const nextDisabled = isAtOrAfterCurrentPeriod(value);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Tabs
        value={value.mode}
        onValueChange={(m) => onChange({ ...value, mode: m as PeriodMode })}
      >
        <TabsList>
          {(Object.keys(MODE_LABELS) as PeriodMode[]).map((k) => (
            <TabsTrigger key={k} value={k}>
              {MODE_LABELS[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {showShift && (
        <div className="flex items-center gap-1">
          <NavButton
            onClick={() => onChange(shiftPeriod(value, -1))}
            label="Kỳ trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </NavButton>
          <PeriodPicker value={value} onChange={onChange} />
          <NavButton
            onClick={() => onChange(shiftPeriod(value, 1))}
            disabled={nextDisabled}
            label="Kỳ sau"
          >
            <ChevronRight className="w-4 h-4" />
          </NavButton>
        </div>
      )}

      {value.mode === "custom" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500">Từ:</span>
          <Input
            type="date"
            value={value.customFrom}
            onChange={(e) => onChange({ ...value, customFrom: e.target.value })}
            className="h-8 w-40"
          />
          <span className="text-neutral-500">Đến:</span>
          <Input
            type="date"
            value={value.customTo}
            onChange={(e) => onChange({ ...value, customTo: e.target.value })}
            className="h-8 w-40"
          />
        </div>
      )}
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  children,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="h-8 w-8 inline-flex items-center justify-center rounded border border-neutral-300 bg-white hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: PeriodState;
  onChange: (v: PeriodState) => void;
}) {
  const setAnchor = (a: Date) => onChange({ ...value, anchor: a });
  const a = value.anchor;
  const now = new Date();
  // Khoảng năm cho phép: từ 2020 đến năm hiện tại + 1
  const years: number[] = [];
  for (let y = 2020; y <= now.getFullYear() + 1; y++) years.push(y);

  if (value.mode === "day") {
    return (
      <Input
        type="date"
        value={toISODate(a)}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m, d] = v.split("-").map(Number);
          setAnchor(new Date(y, m - 1, d));
        }}
        className="h-8 w-40"
      />
    );
  }

  if (value.mode === "month") {
    const mm = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, "0")}`;
    return (
      <Input
        type="month"
        value={mm}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const [y, m] = v.split("-").map(Number);
          setAnchor(new Date(y, m - 1, 1));
        }}
        className="h-8 w-40"
      />
    );
  }

  if (value.mode === "year") {
    return (
      <select
        value={a.getFullYear()}
        onChange={(e) =>
          setAnchor(new Date(Number(e.target.value), a.getMonth(), 1))
        }
        className="h-8 w-28 rounded-md border border-neutral-300 bg-white px-2 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    );
  }

  if (value.mode === "quarter") {
    const q = Math.floor(a.getMonth() / 3) + 1;
    return (
      <div className="flex items-center gap-1">
        <select
          value={q}
          onChange={(e) => {
            const newQ = Number(e.target.value);
            setAnchor(new Date(a.getFullYear(), (newQ - 1) * 3, 1));
          }}
          className="h-8 w-20 rounded-md border border-neutral-300 bg-white px-2 text-sm"
        >
          {[1, 2, 3, 4].map((qn) => (
            <option key={qn} value={qn}>
              Q{qn}
            </option>
          ))}
        </select>
        <select
          value={a.getFullYear()}
          onChange={(e) =>
            setAnchor(new Date(Number(e.target.value), (q - 1) * 3, 1))
          }
          className="h-8 w-24 rounded-md border border-neutral-300 bg-white px-2 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return null;
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
