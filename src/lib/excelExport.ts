import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toISODate } from "./utils";
import type { ProductWithStock } from "@/db/products";
import type { OrderListRow } from "@/db/orders";
import type { OrderStatus, OrderType } from "@/domain/types";

const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Nháp",
  confirmed: "Đã chốt",
  delivered: "Đã giao",
  paid: "Đã thanh toán",
  cancelled: "Đã hủy",
};

const TYPE_LABEL: Record<OrderType, string> = {
  sale: "Phiếu bán",
  purchase: "Phiếu nhập",
  return: "Phiếu trả",
};

type ColWidth = { wch: number };

export type ExportResult =
  | { ok: true; path: string; count: number }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; message: string };

/**
 * Sinh workbook, mở dialog cho user chọn vị trí lưu, rồi ghi file qua Rust.
 * Trả về { ok: true, path, count } hoặc { ok: false, reason }.
 */
async function saveWorkbookWithDialog(
  rows: Record<string, unknown>[],
  header: string[],
  cols: ColWidth[],
  sheetName: string,
  defaultFilename: string,
): Promise<ExportResult> {
  const target = await save({
    title: "Chọn nơi lưu file Excel",
    defaultPath: defaultFilename,
    filters: [{ name: "Excel", extensions: ["xlsx"] }],
  });
  if (!target) return { ok: false, reason: "cancelled" };

  try {
    const ws = XLSX.utils.json_to_sheet(rows, { header });
    ws["!cols"] = cols;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const bytes = Array.from(new Uint8Array(buf));
    await invoke("save_bytes", { path: target, bytes });
    return { ok: true, path: target, count: rows.length };
  } catch (e) {
    return { ok: false, reason: "error", message: (e as Error).message };
  }
}

export async function exportProductsToExcel(
  products: ProductWithStock[],
): Promise<ExportResult> {
  const header = [
    "Mã sản phẩm",
    "Tên sản phẩm",
    "Mã vạch",
    "Đơn vị",
    "Giá vốn",
    "Giá bán",
    "Tồn kho",
    "Số biến thể",
    "Ghi chú",
  ];
  const cols: ColWidth[] = [
    { wch: 12 },
    { wch: 32 },
    { wch: 16 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
    { wch: 24 },
  ];
  const rows = products.map((p) => ({
    "Mã sản phẩm": p.sku,
    "Tên sản phẩm": p.name,
    "Mã vạch": p.barcode ?? "",
    "Đơn vị": p.unit,
    "Giá vốn": p.price_cost,
    "Giá bán": p.price_sell,
    "Tồn kho": p.total_stock,
    "Số biến thể": p.variant_count,
    "Ghi chú": p.note ?? "",
  }));
  return saveWorkbookWithDialog(
    rows,
    header,
    cols,
    "Sản phẩm",
    `san_pham_${toISODate(new Date())}.xlsx`,
  );
}

export async function exportOrdersToExcel(
  orders: OrderListRow[],
  scopeLabel = "Tất cả",
): Promise<ExportResult> {
  const header = [
    "Mã phiếu",
    "Ngày tạo",
    "Loại",
    "Đối tác",
    "Số dòng",
    "Tổng tiền",
    "Đã thu/trả",
    "Còn nợ",
    "Trạng thái",
    "Ghi chú",
  ];
  const cols: ColWidth[] = [
    { wch: 20 },
    { wch: 18 },
    { wch: 12 },
    { wch: 24 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
  ];
  const rows = orders.map((o) => ({
    "Mã phiếu": o.code,
    "Ngày tạo": formatDateTimeForExcel(o.created_at),
    Loại: TYPE_LABEL[o.type],
    "Đối tác": o.partner_name ?? "",
    "Số dòng": o.item_count,
    "Tổng tiền": o.total,
    "Đã thu/trả": o.paid,
    "Còn nợ": Math.max(0, o.total - o.paid),
    "Trạng thái": STATUS_LABEL[o.status],
    "Ghi chú": o.note ?? "",
  }));
  const sheetName = scopeLabel.length > 30 ? scopeLabel.slice(0, 30) : scopeLabel;
  return saveWorkbookWithDialog(
    rows,
    header,
    cols,
    sheetName,
    `don_hang_${toISODate(new Date())}.xlsx`,
  );
}

function formatDateTimeForExcel(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
