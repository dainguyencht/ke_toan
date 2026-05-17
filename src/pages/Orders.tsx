import { useState } from "react";
import { Plus, ShoppingCart, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderDetail } from "@/components/orders/OrderDetail";
import { PurchaseForm } from "@/components/orders/PurchaseForm";
import { SaleForm } from "@/components/orders/SaleForm";
import { useOrders } from "@/hooks/useOrders";
import { formatVND, formatDate } from "@/lib/utils";
import { exportOrdersToExcel } from "@/lib/excelExport";
import type { OrderListRow } from "@/db/orders";
import type { OrderStatus, OrderType } from "@/domain/types";
import { toast } from "sonner";

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

const TAB_LABEL: Record<"all" | OrderType, string> = {
  all: "Tất cả",
  sale: "Phiếu bán",
  purchase: "Phiếu nhập",
  return: "Phiếu trả",
};

export default function Orders() {
  const [openPurchase, setOpenPurchase] = useState(false);
  const [openSale, setOpenSale] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | OrderType>("sale");

  // Lấy data của tab đang active để export. React Query dedupe nên không fetch trùng.
  const { data: ordersForExport = [] } = useOrders(activeTab);

  const handleExport = async () => {
    if (ordersForExport.length === 0) {
      toast.error("Không có đơn để xuất");
      return;
    }
    const res = await exportOrdersToExcel(ordersForExport, TAB_LABEL[activeTab]);
    if (res.ok) {
      toast.success(
        `Đã xuất ${res.count} đơn (${TAB_LABEL[activeTab]}): ${res.path}`,
      );
    } else if (res.reason === "error") {
      toast.error(`Lỗi xuất: ${res.message}`);
    }
    // cancelled → không hiện gì
  };

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
            onClick={handleExport}
            disabled={ordersForExport.length === 0}
            title={`Xuất ${TAB_LABEL[activeTab]} đang xem`}
          >
            <FileDown className="w-4 h-4" />
            Xuất Excel
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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="all">Tất cả</TabsTrigger>
          <TabsTrigger value="purchase">Phiếu nhập</TabsTrigger>
          <TabsTrigger value="sale">Phiếu bán</TabsTrigger>
          <TabsTrigger value="return">Trả hàng</TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <OrdersTable type="all" onRowClick={setDetailId} />
        </TabsContent>
        <TabsContent value="purchase">
          <OrdersTable type="purchase" onRowClick={setDetailId} />
        </TabsContent>
        <TabsContent value="sale">
          <OrdersTable type="sale" onRowClick={setDetailId} />
        </TabsContent>
        <TabsContent value="return">
          <OrdersTable type="return" onRowClick={setDetailId} />
        </TabsContent>
      </Tabs>

      <PurchaseForm open={openPurchase} onOpenChange={setOpenPurchase} />
      <SaleForm open={openSale} onOpenChange={setOpenSale} />
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
  onRowClick,
}: {
  type: "all" | OrderType;
  onRowClick: (id: number) => void;
}) {
  const { data, isLoading, error } = useOrders(type);

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
