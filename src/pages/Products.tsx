import { useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  FileSpreadsheet,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Abbr } from "@/components/ui/abbr";
import { ProductForm } from "@/components/products/ProductForm";
import { ImportProductsDialog } from "@/components/products/ImportProductsDialog";
import { StockCountDialog } from "@/components/products/StockCountDialog";
import { ProductOrdersDialog } from "@/components/products/ProductOrdersDialog";
import {
  useArchiveProduct,
  useProducts,
  useTotalStockValue,
} from "@/hooks/useProducts";
import { formatNumber, formatVND } from "@/lib/utils";
import type { Product } from "@/domain/types";
import { toast } from "sonner";

export default function Products() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openCount, setOpenCount] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [viewingOrders, setViewingOrders] = useState<Product | null>(null);

  const { data: products, isLoading, error } = useProducts(search);
  const { data: stockValue } = useTotalStockValue();
  const archive = useArchiveProduct();

  const handleEdit = (p: Product) => {
    setEditing(p);
    setOpen(true);
  };
  const handleNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const handleArchive = async (p: Product) => {
    if (!confirm(`Ẩn sản phẩm "${p.name}"?`)) return;
    try {
      await archive.mutateAsync(p.id);
      toast.success("Đã ẩn sản phẩm");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Sản phẩm</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {products?.length ?? 0} sản phẩm
            {stockValue != null && (
              <>
                {" · "}
                <Abbr title="Tổng giá trị hàng tồn kho theo giá vốn (toàn bộ sản phẩm)">
                  Tồn kho:
                </Abbr>{" "}
                <span className="font-medium text-neutral-700">
                  {formatVND(stockValue)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setOpenCount(true)}>
            <ClipboardCheck className="w-4 h-4" />
            Kiểm kho
          </Button>
          <Button variant="outline" onClick={() => setOpenImport(true)}>
            <FileSpreadsheet className="w-4 h-4" />
            Nhập từ Excel
          </Button>
          <Button onClick={handleNew}>
            <Plus className="w-4 h-4" />
            Thêm sản phẩm
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên, mã sản phẩm, mã vạch..."
          className="pl-9"
        />
      </div>

      <div className="border border-neutral-200 rounded-md bg-white">
        {error ? (
          <div className="p-6 text-red-600">Lỗi: {(error as Error).message}</div>
        ) : isLoading ? (
          <div className="p-6 text-neutral-500">Đang tải...</div>
        ) : !products?.length ? (
          <div className="p-12 text-center text-neutral-500">
            <p>Chưa có sản phẩm nào.</p>
            <Button variant="link" onClick={handleNew}>
              Thêm sản phẩm đầu tiên
            </Button>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Mã sản phẩm</TH>
                <TH>Tên sản phẩm</TH>
                <TH>Mã vạch</TH>
                <TH className="text-right">
                  <Abbr title="Giá vốn - Giá nhập hàng từ NCC">Giá vốn</Abbr>
                </TH>
                <TH className="text-right">Giá bán</TH>
                <TH className="text-right">Tồn kho</TH>
                <TH className="w-20"></TH>
              </TR>
            </THead>
            <TBody>
              {products.map((p) => (
                <TR
                  key={p.id}
                  onClick={() => setViewingOrders(p)}
                  className="cursor-pointer"
                  title="Xem lịch sử phiếu nhập/bán của SP"
                >
                  <TD className="font-mono text-xs">{p.sku}</TD>
                  <TD className="font-medium">{p.name}</TD>
                  <TD className="text-neutral-500 text-xs">{p.barcode ?? "-"}</TD>
                  <TD className="text-right text-neutral-500 tabular-nums">
                    {formatVND(p.price_cost)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatVND(p.price_sell)}
                  </TD>
                  <TD className="text-right">
                    <span
                      className={
                        p.total_stock <= 0
                          ? "text-red-600 font-medium"
                          : "text-neutral-700"
                      }
                    >
                      {formatNumber(p.total_stock)} {p.unit}
                    </span>
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(p)}
                        title="Sửa"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleArchive(p)}
                        title="Ẩn"
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

      <ProductForm open={open} onOpenChange={setOpen} product={editing} />
      <ImportProductsDialog open={openImport} onOpenChange={setOpenImport} />
      <StockCountDialog open={openCount} onOpenChange={setOpenCount} />
      <ProductOrdersDialog
        open={viewingOrders != null}
        onOpenChange={(o) => !o && setViewingOrders(null)}
        product={viewingOrders}
      />
    </div>
  );
}
