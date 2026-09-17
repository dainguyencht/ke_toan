import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { OrderDetail } from "@/components/orders/OrderDetail";
import {
  useOrdersByProduct,
  useStockAdjustmentsByProduct,
} from "@/hooks/useOrders";
import { cn, formatDateTime, formatNumber, formatVND, toISODate } from "@/lib/utils";
import type {
  DateFilter,
  ProductOrderRow,
  ProductStockAdjustRow,
} from "@/db/orders";
import type { OrderType } from "@/domain/types";
import type { Product } from "@/domain/types";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
};

type DateMode = "today" | "range" | "all";

const TYPE_LABEL: Record<OrderType, { text: string; tone: string }> = {
  sale: { text: "Bán", tone: "bg-blue-50 text-blue-700" },
  purchase: { text: "Nhập", tone: "bg-emerald-50 text-emerald-700" },
  return: { text: "Trả", tone: "bg-amber-50 text-amber-700" },
};

const ADJUST_TONE = "bg-violet-50 text-violet-700";

/** Dấu của tác động lên tồn kho của 1 dòng phiếu */
function stockSign(r: ProductOrderRow): 1 | -1 {
  if (r.type === "purchase") return 1;
  if (r.type === "sale") return -1;
  // return: customer-side → stock+, supplier-side → stock-
  if (r.customer_id != null) return 1;
  return -1;
}

/**
 * 1 dòng lịch sử kho: phiếu nhập/bán/trả, HOẶC biến động không gắn phiếu
 * (kiểm kho, điều chỉnh tay, tồn đầu kỳ). Phải hiện cả hai thì cột "Tồn sau"
 * mới cộng trừ khớp nhau - trước đây ẩn dòng điều chỉnh nên tồn trông như sai.
 */
type Row =
  | { kind: "order"; at: string; o: ProductOrderRow }
  | { kind: "adjust"; at: string; a: ProductStockAdjustRow };

type TypeTab = "all" | OrderType | "adjust";

/** Thay đổi tồn (đơn vị gốc, có dấu) của 1 dòng bất kỳ */
function rowStockDelta(r: Row): number {
  if (r.kind === "adjust") return r.a.qty_change;
  return stockSign(r.o) * r.o.qty * (r.o.unit_factor || 1);
}

export function ProductOrdersDialog({ open, onOpenChange, product }: Props) {
  const [detailId, setDetailId] = useState<number | null>(null);
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [typeTab, setTypeTab] = useState<TypeTab>("all");
  const today = toISODate(new Date());
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const dateFilter: DateFilter = useMemo(() => {
    if (dateMode === "all") return {};
    if (dateMode === "today") return { from: today, to: today };
    return { from: fromDate || null, to: toDate || null };
  }, [dateMode, today, fromDate, toDate]);

  const productId = open && product ? product.id : null;
  const { data: orderRows = [], isLoading } = useOrdersByProduct(
    productId,
    dateFilter,
  );
  const { data: adjustRows = [], isLoading: loadingAdjust } =
    useStockAdjustmentsByProduct(productId, dateFilter);

  // Gộp 2 nguồn thành 1 timeline, mới nhất trước
  const allRows: Row[] = useMemo(() => {
    const merged: Row[] = [
      ...orderRows.map((o) => ({ kind: "order" as const, at: o.created_at, o })),
      ...adjustRows.map((a) => ({
        kind: "adjust" as const,
        at: a.created_at,
        a,
      })),
    ];
    return merged.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  }, [orderRows, adjustRows]);

  if (!product) return null;

  // Tổng hợp theo loại (toàn bộ)
  let totalPurchaseQty = 0;
  let totalSaleQty = 0;
  let totalReturnQty = 0;
  let totalPurchaseValue = 0;
  let totalSaleValue = 0;
  for (const r of orderRows) {
    const qtyBase = r.qty * (r.unit_factor || 1);
    if (r.type === "purchase") {
      totalPurchaseQty += qtyBase;
      totalPurchaseValue += r.total;
    } else if (r.type === "sale") {
      totalSaleQty += qtyBase;
      totalSaleValue += r.total;
    } else {
      totalReturnQty += qtyBase;
    }
  }
  const totalAdjustQty = adjustRows.reduce((s, a) => s + a.qty_change, 0);

  // Count theo từng tab
  const counts = {
    all: allRows.length,
    purchase: orderRows.filter((r) => r.type === "purchase").length,
    sale: orderRows.filter((r) => r.type === "sale").length,
    return: orderRows.filter((r) => r.type === "return").length,
    adjust: adjustRows.length,
  };

  // Rows hiển thị theo tab + tồn kho net (signed) cho tab đang chọn
  const visibleRows =
    typeTab === "all"
      ? allRows
      : typeTab === "adjust"
        ? allRows.filter((r) => r.kind === "adjust")
        : allRows.filter((r) => r.kind === "order" && r.o.type === typeTab);
  const tabStockNet = visibleRows.reduce((s, r) => s + rowStockDelta(r), 0);
  const tabTotalValue = visibleRows.reduce(
    (s, r) => s + (r.kind === "order" ? r.o.total : 0),
    0,
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-6xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Lịch sử kho - {product.sku} · {product.name}
            </DialogTitle>
          </DialogHeader>

          {/* Bộ lọc thời gian */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-md border border-neutral-300 bg-white p-0.5">
              {(["all", "today", "range"] as DateMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDateMode(m)}
                  className={cn(
                    "px-3 py-1 text-sm rounded",
                    dateMode === m
                      ? "bg-brand-500 text-white"
                      : "text-neutral-600 hover:bg-neutral-100",
                  )}
                >
                  {m === "today"
                    ? "Hôm nay"
                    : m === "range"
                      ? "Khoảng ngày"
                      : "Tất cả"}
                </button>
              ))}
            </div>
            {dateMode === "range" && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-neutral-500">Từ:</span>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-8 w-40"
                />
                <span className="text-neutral-500">Đến:</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-8 w-40"
                />
              </div>
            )}
          </div>

          {/* Tabs loại phiếu */}
          <Tabs value={typeTab} onValueChange={(v) => setTypeTab(v as TypeTab)}>
            <TabsList>
              <TabsTrigger value="all">Tất cả ({counts.all})</TabsTrigger>
              <TabsTrigger value="purchase">Nhập ({counts.purchase})</TabsTrigger>
              <TabsTrigger value="sale">Bán ({counts.sale})</TabsTrigger>
              <TabsTrigger value="return">Trả ({counts.return})</TabsTrigger>
              <TabsTrigger value="adjust">
                Điều chỉnh ({counts.adjust})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Bảng lịch sử */}
          {isLoading || loadingAdjust ? (
            <div className="p-6 text-neutral-500 text-sm">Đang tải...</div>
          ) : visibleRows.length === 0 ? (
            <div className="p-10 text-center text-neutral-500 text-sm">
              Không có dòng nào.
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
                      <TH>Đối tác / Diễn giải</TH>
                      <TH className="text-right">SL ({product.unit})</TH>
                      <TH className="text-right">Tồn sau</TH>
                      <TH className="text-right">Đơn giá</TH>
                      <TH className="text-right">Thành tiền</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {visibleRows.map((row, idx) => {
                      const delta = rowStockDelta(row);
                      const qtyCell = (
                        <TD
                          className={cn(
                            "text-right tabular-nums",
                            delta < 0
                              ? "text-red-600"
                              : delta > 0
                                ? "text-green-700"
                                : "",
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {formatNumber(delta)}
                          {row.kind === "order" &&
                            row.o.unit_name !== row.o.base_unit && (
                              <div className="text-xs text-neutral-400">
                                ({formatNumber(row.o.qty)} {row.o.unit_name})
                              </div>
                            )}
                        </TD>
                      );
                      const stockCell = (
                        <TD className="text-right tabular-nums text-neutral-600">
                          {formatNumber(
                            row.kind === "order"
                              ? row.o.stock_after
                              : row.a.stock_after,
                          )}{" "}
                          {product.unit}
                        </TD>
                      );

                      if (row.kind === "adjust") {
                        const isInit = row.a.type === "init";
                        return (
                          <TR key={`adj-${row.a.movement_id}`}>
                            <TD className="text-neutral-400">-</TD>
                            <TD className="text-neutral-600 whitespace-nowrap">
                              {formatDateTime(row.a.created_at)}
                            </TD>
                            <TD>
                              <span
                                className={cn(
                                  "inline-flex whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium",
                                  ADJUST_TONE,
                                )}
                              >
                                {isInit ? "Tồn đầu" : "Điều chỉnh"}
                              </span>
                            </TD>
                            <TD className="text-neutral-600">
                              {row.a.note ?? (
                                <span className="text-neutral-400">
                                  Điều chỉnh tồn kho
                                </span>
                              )}
                            </TD>
                            {qtyCell}
                            {stockCell}
                            <TD className="text-right text-neutral-400">-</TD>
                            <TD className="text-right text-neutral-400">-</TD>
                          </TR>
                        );
                      }

                      const r = row.o;
                      const tInfo = TYPE_LABEL[r.type];
                      const pricePerBase =
                        r.unit_factor > 0 ? r.price / r.unit_factor : r.price;
                      return (
                        <TR
                          key={`${r.order_id}-${idx}`}
                          onClick={() => setDetailId(r.order_id)}
                          className="cursor-pointer"
                        >
                          <TD className="font-mono text-xs whitespace-nowrap">{r.code}</TD>
                          <TD className="text-neutral-600 whitespace-nowrap">
                            {formatDateTime(r.created_at)}
                          </TD>
                          <TD>
                            <span
                              className={cn(
                                "inline-flex whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium",
                                tInfo.tone,
                              )}
                            >
                              {tInfo.text}
                            </span>
                          </TD>
                          <TD>
                            {r.partner_name ?? (
                              <span className="text-neutral-400">-</span>
                            )}
                          </TD>
                          {qtyCell}
                          {stockCell}
                          <TD className="text-right tabular-nums">
                            {formatVND(pricePerBase)}
                          </TD>
                          <TD className="text-right tabular-nums font-medium">
                            {formatVND(r.total)}
                          </TD>
                        </TR>
                      );
                    })}
                    <TR className="font-medium bg-neutral-50">
                      <TD colSpan={4}>
                        Tổng cộng ({visibleRows.length} dòng)
                      </TD>
                      <TD
                        className={cn(
                          "text-right tabular-nums",
                          tabStockNet < 0
                            ? "text-red-600"
                            : tabStockNet > 0
                              ? "text-green-700"
                              : "",
                        )}
                      >
                        {tabStockNet > 0 ? "+" : ""}
                        {formatNumber(tabStockNet)} {product.unit}
                      </TD>
                      <TD />
                      <TD />
                      <TD className="text-right tabular-nums">
                        {formatVND(tabTotalValue)}
                      </TD>
                    </TR>
                  </TBody>
                </Table>
              </div>

              {/* Tổng kết */}
              <div className="border border-neutral-200 rounded-md bg-neutral-50 p-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                {totalPurchaseQty > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">SL đã nhập:</span>
                      <span className="tabular-nums">
                        {formatNumber(totalPurchaseQty)} {product.unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Giá trị nhập:</span>
                      <span className="tabular-nums">
                        {formatVND(totalPurchaseValue)}
                      </span>
                    </div>
                  </>
                )}
                {totalSaleQty > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">SL đã bán:</span>
                      <span className="tabular-nums">
                        {formatNumber(totalSaleQty)} {product.unit}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-500">Doanh thu:</span>
                      <span className="tabular-nums">
                        {formatVND(totalSaleValue)}
                      </span>
                    </div>
                  </>
                )}
                {totalReturnQty > 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">SL trả hàng:</span>
                    <span className="tabular-nums text-amber-700">
                      {formatNumber(totalReturnQty)} {product.unit}
                    </span>
                  </div>
                )}
                {totalAdjustQty !== 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Điều chỉnh kho:</span>
                    <span className="tabular-nums text-violet-700">
                      {totalAdjustQty > 0 ? "+" : ""}
                      {formatNumber(totalAdjustQty)} {product.unit}
                    </span>
                  </div>
                )}
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
