import { useMemo, useState } from "react";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useDebtList,
  useProfitByProduct,
  useRevenueByDay,
  useStockValuation,
} from "@/hooks/useReports";
import { cn, daysAgo, formatDate, formatVND } from "@/lib/utils";

type Range = "7d" | "30d" | "90d";
const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABEL: Record<Range, string> = {
  "7d": "7 ngày",
  "30d": "30 ngày",
  "90d": "90 ngày",
};

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
  const { data = [] } = useRevenueByDay(RANGE_DAYS[range]);

  const totals = data.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      orders: acc.orders + r.orders,
    }),
    { revenue: 0, orders: 0 },
  );

  return (
    <div className="space-y-3">
      <RangeFilter value={range} onChange={setRange} />
      <div className="grid grid-cols-2 gap-3">
        <Summary label="Tổng doanh thu" value={formatVND(totals.revenue)} />
        <Summary label="Tổng số đơn" value={String(totals.orders)} />
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
                <TH className="text-right">TB / đơn</TH>
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
  const { from, to } = useMemo(
    () => ({ from: daysAgo(RANGE_DAYS[range] - 1), to: daysAgo(0) }),
    [range],
  );
  const { data = [] } = useProfitByProduct(from, to);

  const totals = data.reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue,
      cost: acc.cost + r.cost_total,
      profit: acc.profit + r.profit,
    }),
    { revenue: 0, cost: 0, profit: 0 },
  );
  const margin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0;

  return (
    <div className="space-y-3">
      <RangeFilter value={range} onChange={setRange} />
      <div className="grid grid-cols-4 gap-3">
        <Summary label="Doanh thu" value={formatVND(totals.revenue)} />
        <Summary label="Giá vốn" value={formatVND(totals.cost)} />
        <Summary
          label="Lãi gộp"
          value={formatVND(totals.profit)}
          tone={totals.profit >= 0 ? "green" : "red"}
        />
        <Summary
          label="Biên lãi"
          value={`${margin.toFixed(1)}%`}
          tone={margin >= 0 ? "green" : "red"}
        />
      </div>
      <div className="border border-neutral-200 rounded-md bg-white">
        {data.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>SKU</TH>
                <TH>Sản phẩm</TH>
                <TH className="text-right">SL bán</TH>
                <TH className="text-right">Doanh thu</TH>
                <TH className="text-right">Giá vốn</TH>
                <TH className="text-right">Lãi gộp</TH>
                <TH className="text-right">Biên %</TH>
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
                <TH>SKU</TH>
                <TH>Sản phẩm</TH>
                <TH className="text-right">Tồn</TH>
                <TH className="text-right">Giá vốn</TH>
                <TH className="text-right">Giá trị</TH>
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
        {(Object.keys(RANGE_DAYS) as Range[]).map((k) => (
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
}: {
  label: string;
  value: string;
  tone?: "neutral" | "green" | "red" | "amber";
}) {
  const toneClass = {
    neutral: "text-neutral-900",
    green: "text-green-700",
    red: "text-red-700",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className="border border-neutral-200 rounded-md p-3 bg-white">
      <div className="text-xs text-neutral-500">{label}</div>
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
