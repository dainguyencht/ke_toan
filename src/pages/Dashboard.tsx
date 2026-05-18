import {
  TrendingUp,
  Wallet,
  Users,
  Truck,
  AlertCircle,
  ShoppingCart,
  PackageX,
  Trophy,
  BadgePercent,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  useDashboardStats,
  useLowStockItems,
  useTopProducts,
} from "@/hooks/useReports";
import { cn, formatNumber, formatVND } from "@/lib/utils";

export default function Dashboard() {
  const { data: stats } = useDashboardStats();
  const { data: topProducts = [] } = useTopProducts(7);
  const { data: lowStock = [] } = useLowStockItems(5);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Tổng quan hoạt động của cửa hàng
        </p>
      </div>

      {/* Hàng 1: Doanh thu */}
      <div>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Doanh thu
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Hôm nay"
            value={formatVND(stats?.revenue_today ?? 0)}
            sub={`${stats?.orders_today ?? 0} đơn`}
            icon={<TrendingUp className="w-5 h-5" />}
            tone="brand"
          />
          <KpiCard
            label="7 ngày qua"
            value={formatVND(stats?.revenue_7d ?? 0)}
            sub={`${stats?.orders_7d ?? 0} đơn`}
            icon={<ShoppingCart className="w-5 h-5" />}
            tone="brand"
          />
          <KpiCard
            label="Tồn quỹ"
            value={formatVND(stats?.cash_balance ?? 0)}
            sub="Tiền mặt tích lũy"
            icon={<Wallet className="w-5 h-5" />}
            tone={(stats?.cash_balance ?? 0) >= 0 ? "green" : "red"}
            href="/cashbook"
          />
          <KpiCard
            label="SP cảnh báo"
            value={String(stats?.low_stock_count ?? 0)}
            sub="Tồn ≤ 5"
            icon={<PackageX className="w-5 h-5" />}
            tone={(stats?.low_stock_count ?? 0) > 0 ? "amber" : "neutral"}
            href="/products"
          />
        </div>
      </div>

      {/* Hàng 2: Lãi gộp */}
      <div>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Lãi gộp
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <KpiCard
            label="Hôm nay"
            value={formatVND(stats?.profit_today ?? 0)}
            sub="= Doanh thu − Giá vốn"
            icon={<BadgePercent className="w-5 h-5" />}
            tone={(stats?.profit_today ?? 0) >= 0 ? "green" : "red"}
          />
          <KpiCard
            label="7 ngày qua"
            value={formatVND(stats?.profit_7d ?? 0)}
            sub="Chưa trừ chi phí khác"
            icon={<BadgePercent className="w-5 h-5" />}
            tone={(stats?.profit_7d ?? 0) >= 0 ? "green" : "red"}
            href="/reports"
          />
        </div>
      </div>

      {/* Hàng 3: Công nợ */}
      <div>
        <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wide mb-2">
          Công nợ
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <KpiCard
            label="Phải thu (khách hàng)"
            value={formatVND(stats?.debt_receivable ?? 0)}
            sub="Khách còn nợ tiền hàng"
            icon={<Users className="w-5 h-5" />}
            tone="amber"
            href="/customers"
          />
          <KpiCard
            label="Phải trả (NCC)"
            value={formatVND(stats?.debt_payable ?? 0)}
            sub="Mình còn nợ NCC"
            icon={<Truck className="w-5 h-5" />}
            tone="amber"
            href="/customers"
          />
        </div>
      </div>

      {/* Hàng 3: 2 bảng cạnh nhau */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="Top 5 sản phẩm bán chạy (7 ngày)"
          icon={<Trophy className="w-4 h-4" />}
        >
          {topProducts.length === 0 ? (
            <EmptyMsg text="Chưa có đơn bán nào trong 7 ngày qua." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>SP</TH>
                  <TH className="text-right">SL bán</TH>
                  <TH className="text-right">Doanh thu</TH>
                </TR>
              </THead>
              <TBody>
                {topProducts.slice(0, 5).map((p) => (
                  <TR key={p.variant_id}>
                    <TD>
                      <div className="font-medium">{p.product_name}</div>
                      <div className="text-xs text-neutral-500 font-mono">{p.sku}</div>
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatNumber(p.total_qty)}{" "}
                      <span className="text-neutral-500 text-xs">{p.base_unit}</span>
                    </TD>
                    <TD className="text-right tabular-nums font-medium">
                      {formatVND(p.total_revenue)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>

        <Panel
          title="Tồn kho cảnh báo"
          icon={<AlertCircle className="w-4 h-4 text-amber-500" />}
        >
          {lowStock.length === 0 ? (
            <EmptyMsg text="Không có sản phẩm nào tồn thấp 🎉" />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>SP</TH>
                  <TH className="text-right">Tồn</TH>
                </TR>
              </THead>
              <TBody>
                {lowStock.slice(0, 8).map((p) => (
                  <TR key={p.variant_id}>
                    <TD>
                      <div className="font-medium">{p.product_name}</div>
                      <div className="text-xs text-neutral-500 font-mono">{p.sku}</div>
                    </TD>
                    <TD
                      className={cn(
                        "text-right font-medium",
                        p.stock_qty <= 0 ? "text-red-600" : "text-amber-600",
                      )}
                    >
                      {formatNumber(p.stock_qty)} {p.unit}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Panel>
      </div>
    </div>
  );
}

type Tone = "brand" | "green" | "red" | "amber" | "neutral";

const TONES: Record<Tone, { iconBg: string; valueColor: string }> = {
  brand: { iconBg: "bg-brand-50 text-brand-600", valueColor: "text-neutral-900" },
  green: { iconBg: "bg-green-50 text-green-600", valueColor: "text-green-700" },
  red: { iconBg: "bg-red-50 text-red-600", valueColor: "text-red-700" },
  amber: { iconBg: "bg-amber-50 text-amber-600", valueColor: "text-amber-700" },
  neutral: { iconBg: "bg-neutral-100 text-neutral-500", valueColor: "text-neutral-900" },
};

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: Tone;
  href?: string;
}) {
  const t = TONES[tone];
  const inner = (
    <div
      className={cn(
        "border border-neutral-200 rounded-md p-4 bg-white transition-shadow",
        href && "hover:shadow-md cursor-pointer",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-500">{label}</span>
        <span className={cn("p-1.5 rounded", t.iconBg)}>{icon}</span>
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tabular-nums", t.valueColor)}>
        {value}
      </div>
      {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
  return href ? <Link to={href}>{inner}</Link> : inner;
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-neutral-200 rounded-md bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center gap-2 text-sm font-medium text-neutral-700">
        {icon}
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return <div className="p-6 text-center text-neutral-400 text-sm">{text}</div>;
}
