import { useMemo, useState } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Abbr } from "@/components/ui/abbr";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDebtList,
  useProfitByProduct,
  useProfitTotal,
  useRevenueByDay,
  useRevenueTotal,
  useStockValuation,
} from "@/hooks/useReports";
import {
  cn,
  daysAgo,
  formatDate,
  formatVND,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "@/lib/utils";

type Range = "7d" | "30d" | "month" | "quarter" | "year";

const RANGE_LABEL: Record<Range, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  month: "Tháng này",
  quarter: "Quý này",
  year: "Năm này",
};

/** Đổi preset thành cặp ngày (from, to) theo định dạng YYYY-MM-DD */
function rangeToDates(r: Range): { from: string; to: string } {
  const to = daysAgo(0);
  let from: string;
  switch (r) {
    case "7d":
      from = daysAgo(6);
      break;
    case "30d":
      from = daysAgo(29);
      break;
    case "month":
      from = startOfMonth();
      break;
    case "quarter":
      from = startOfQuarter();
      break;
    case "year":
      from = startOfYear();
      break;
  }
  return { from, to };
}

export default function Reports() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Báo cáo</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Doanh thu, lãi gộp, tồn kho, công nợ
        </p>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
          <TabsTrigger value="profit">Lãi gộp</TabsTrigger>
          <TabsTrigger value="stock">Tồn kho</TabsTrigger>
          <TabsTrigger value="debt">Công nợ</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue">
          <RevenueReport />
        </TabsContent>
        <TabsContent value="profit">
          <ProfitReport />
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

/* ===== Doanh thu theo ngày ===== */
function RevenueReport() {
  const [range, setRange] = useState<Range>("30d");
  const { from, to } = useMemo(() => rangeToDates(range), [range]);
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

      <RangeFilter value={range} onChange={setRange} />
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
                <TR key={r.date}>
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
    </div>
  );
}

/* ===== Lãi gộp theo SP ===== */
function ProfitReport() {
  const [range, setRange] = useState<Range>("30d");
  const { from, to } = useMemo(() => rangeToDates(range), [range]);
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
            value: `${allMargin.toFixed(1)}%`,
            tone: allMargin >= 0 ? "green" : "red",
          },
        ]}
      />

      <RangeFilter value={range} onChange={setRange} />
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
          value={`${margin.toFixed(1)}%`}
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
                <TH>
                  <Abbr title="Stock Keeping Unit - Mã định danh sản phẩm">
                    SKU
                  </Abbr>
                </TH>
                <TH>Sản phẩm</TH>
                <TH className="text-right">
                  <Abbr title="Số lượng bán">SL bán</Abbr>
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
                    <TD className="text-right tabular-nums">{r.qty_sold}</TD>
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
                      {m.toFixed(1)}%
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
        <Summary label="Tổng tồn" value={totalQty.toFixed(0)} />
        <Summary label="Giá trị tồn" value={formatVND(totalValue)} />
      </div>
      <div className="border border-neutral-200 rounded-md bg-white">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>
                  <Abbr title="Stock Keeping Unit - Mã định danh sản phẩm">
                    SKU
                  </Abbr>
                </TH>
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
                    {r.stock_qty} {r.unit}
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
  value: Range;
  onChange: (v: Range) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Range)}>
      <TabsList>
        {(Object.keys(RANGE_LABEL) as Range[]).map((k) => (
          <TabsTrigger key={k} value={k}>
            {RANGE_LABEL[k]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
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
