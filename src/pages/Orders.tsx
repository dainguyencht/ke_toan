import { useMemo, useState } from "react";
import { Plus, ShoppingCart, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { PurchaseForm } from "@/components/orders/PurchaseForm";
import { SaleForm } from "@/components/orders/SaleForm";
import { ReturnForm, type ReturnKind } from "@/components/orders/ReturnForm";
import { InvoicePreviewDialog } from "@/components/orders/InvoicePreviewDialog";
import { useOrder, useOrders } from "@/hooks/useOrders";
import { cn, formatVND, formatDate, toISODate } from "@/lib/utils";
import type { DateFilter, OrderListRow } from "@/db/orders";
import type { OrderStatus, OrderType } from "@/domain/types";

const STATUS_LABEL: Record<OrderStatus, { text: string; tone: string }> = {
  draft: { text: "Nháp", tone: "text-neutral-500 bg-neutral-100" },
  confirmed: { text: "Đã chốt", tone: "text-blue-700 bg-blue-50" },
  delivered: { text: "Đã giao", tone: "text-amber-700 bg-amber-50" },
  paid: { text: "Đã thanh toán", tone: "text-green-700 bg-green-50" },
  cancelled: { text: "Đã hủy", tone: "text-red-700 bg-red-50" },
};

const TYPE_LABEL: Record<OrderType, string> = {
  sale: "Bán",
  purchase: "Nhập",
  return: "Trả",
};

type DateMode = "today" | "range" | "all";

export default function Orders() {
  const [openPurchase, setOpenPurchase] = useState(false);
  const [openSale, setOpenSale] = useState(false);
  const [returnKind, setReturnKind] = useState<ReturnKind | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | OrderType>("sale");

  const [dateMode, setDateMode] = useState<DateMode>("all");
  const today = toISODate(new Date());
  const [fromDate, setFromDate] = useState<string>(today);
  const [toDate, setToDate] = useState<string>(today);

  const dateFilter: DateFilter = useMemo(() => {
    if (dateMode === "all") return {};
    if (dateMode === "today") return { from: today, to: today };
    return { from: fromDate || null, to: toDate || null };
  }, [dateMode, today, fromDate, toDate]);

  const { data: previewOrder } = useOrder(previewOrderId);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Đơn hàng</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Phiếu nhập, đơn bán, đơn trả hàng
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setReturnKind("to-supplier")}
            title="Trả lại hàng cho nhà cung cấp"
          >
            <RotateCcw className="w-4 h-4" />
            Trả NCC
          </Button>
          <Button
            variant="outline"
            onClick={() => setReturnKind("from-customer")}
            title="Khách hàng trả lại hàng"
          >
            <RotateCcw className="w-4 h-4" />
            Trả từ KH
          </Button>
          <Button variant="outline" onClick={() => setOpenPurchase(true)}>
            <Plus className="w-4 h-4" />
            Phiếu nhập
          </Button>
          <Button onClick={() => setOpenSale(true)}>
            <ShoppingCart className="w-4 h-4" />
            Phiếu bán
          </Button>
        </div>
      </div>

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
              {m === "today" ? "Hôm nay" : m === "range" ? "Khoảng ngày" : "Tất cả"}
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">Tất cả</TabsTrigger>
          <TabsTrigger value="purchase">Phiếu nhập</TabsTrigger>
          <TabsTrigger value="sale">Phiếu bán</TabsTrigger>
          <TabsTrigger value="return">Trả hàng</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <OrdersTable type="all" dateFilter={dateFilter} onRowClick={setDetailId} />
        </TabsContent>
        <TabsContent value="purchase">
          <OrdersTable type="purchase" dateFilter={dateFilter} onRowClick={setDetailId} />
        </TabsContent>
        <TabsContent value="sale">
          <OrdersTable type="sale" dateFilter={dateFilter} onRowClick={setDetailId} />
        </TabsContent>
        <TabsContent value="return">
          <OrdersTable type="return" dateFilter={dateFilter} onRowClick={setDetailId} />
        </TabsContent>
      </Tabs>

      <PurchaseForm open={openPurchase} onOpenChange={setOpenPurchase} />
      <SaleForm
        open={openSale}
        onOpenChange={setOpenSale}
        onSuccess={(id) => setPreviewOrderId(id)}
      />
      <InvoicePreviewDialog
        order={previewOrder ?? null}
        open={previewOrderId != null && previewOrder != null}
        onOpenChange={(o) => !o && setPreviewOrderId(null)}
      />
      {returnKind && (
        <ReturnForm
          open={returnKind != null}
          onOpenChange={(v) => !v && setReturnKind(null)}
          kind={returnKind}
        />
      )}
      <OrderDetail
        open={detailId != null}
        onOpenChange={(o) => !o && setDetailId(null)}
        orderId={detailId}
      />
    </div>
  );
}

function OrdersTable({
  type,
  dateFilter,
  onRowClick,
}: {
  type: "all" | OrderType;
  dateFilter: DateFilter;
  onRowClick: (id: number) => void;
}) {
  const { data, isLoading, error } = useOrders(type, dateFilter);

  if (error) return <div className="p-6 text-red-600">Lỗi: {(error as Error).message}</div>;
  if (isLoading) return <div className="p-6 text-neutral-500">Đang tải...</div>;
  if (!data?.length) {
    return (
      <div className="p-12 text-center text-neutral-500 border border-neutral-200 rounded-md bg-white">
        Chưa có đơn nào.
      </div>
    );
  }

  return (
    <div className="border border-neutral-200 rounded-md bg-white">
      <Table>
        <THead>
          <TR>
            <TH>Mã phiếu</TH>
            <TH>Ngày</TH>
            <TH>Loại</TH>
            <TH>Đối tác</TH>
            <TH className="text-center">Số dòng</TH>
            <TH className="text-right">Tổng tiền</TH>
            <TH className="text-right">Đã trả</TH>
            <TH>Trạng thái</TH>
          </TR>
        </THead>
        <TBody>
          {data.map((o: OrderListRow) => {
            const st = STATUS_LABEL[o.status];
            return (
              <TR
                key={o.id}
                onClick={() => onRowClick(o.id)}
                className="cursor-pointer"
              >
                <TD className="font-mono text-xs">{o.code}</TD>
                <TD className="text-neutral-600">{formatDate(o.created_at)}</TD>
                <TD>{TYPE_LABEL[o.type]}</TD>
                <TD>{o.partner_name ?? <span className="text-neutral-400">-</span>}</TD>
                <TD className="text-center">{o.item_count}</TD>
                <TD className="text-right font-medium">{formatVND(o.total)}</TD>
                <TD className="text-right text-neutral-600">{formatVND(o.paid)}</TD>
                <TD>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${st.tone}`}
                  >
                    {st.text}
                  </span>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
