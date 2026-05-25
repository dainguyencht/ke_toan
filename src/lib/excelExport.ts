import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import ExcelJS from "exceljs";
import type { Contact, ContactKind } from "@/db/contacts";
import type { OrderListRow } from "@/db/orders";
import type { CashTransaction, OrderItem, OrderType } from "@/domain/types";
import type { SettingsMap } from "@/db/settings";
import { getOrderItems } from "@/db/orders";
import { toISODate } from "./utils";

type ItemWithMeta = OrderItem & {
  sku: string;
  product_name: string;
  base_unit: string;
};

type ExportArgs = {
  kind: ContactKind;
  contact: Contact;
  orders: OrderListRow[];
  cashFlow: CashTransaction[];
  settings: SettingsMap | undefined;
};

export type ExportResult =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelled" }
  | { ok: false; reason: "error"; message: string };

type TimelineRow =
  | { kind: "order"; o: OrderListRow }
  | { kind: "cash"; t: CashTransaction };

function orderTypeLabel(type: OrderType): string {
  return type === "sale" ? "Bán hàng" : type === "purchase" ? "Nhập hàng" : "Trả hàng";
}

function valuesFor(
  r: TimelineRow,
  kind: ContactKind,
): { debit: number; credit: number } {
  if (r.kind === "order") {
    return r.o.type === "return"
      ? { debit: 0, credit: r.o.total }
      : { debit: r.o.total, credit: 0 };
  }
  const reducesDebt =
    (kind === "customer" && r.t.type === "in") ||
    (kind === "supplier" && r.t.type === "out");
  return reducesDebt
    ? { debit: 0, credit: r.t.amount }
    : { debit: r.t.amount, credit: 0 };
}

function formatDateTimeForCell(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const MONEY_FMT = "#,##0;[Red]-#,##0";
const QTY_FMT = "#,##0.##";

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF888888" } },
  left: { style: "thin", color: { argb: "FF888888" } },
  bottom: { style: "thin", color: { argb: "FF888888" } },
  right: { style: "thin", color: { argb: "FF888888" } },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF7" }, // light blue-gray
};

const PARENT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF5F5F5" }, // light gray
};

/**
 * Xuất công nợ chi tiết KH/NCC theo phong cách KiotViet:
 * Header shop → tiêu đề → info contact + period → bảng timeline.
 *
 * Build từ scratch với exceljs để chủ động styling (không phụ thuộc template
 * gốc — vì exceljs có vấn đề khi clone style từ template đã load).
 */
export async function exportContactStatementToExcel(
  args: ExportArgs,
): Promise<ExportResult> {
  try {
    const isCustomer = args.kind === "customer";

    // Fetch items cho mọi order
    const itemsByOrder = new Map<number, ItemWithMeta[]>();
    for (const o of args.orders) {
      itemsByOrder.set(o.id, await getOrderItems(o.id));
    }

    // Build timeline asc
    const timeline: TimelineRow[] = [
      ...args.orders.map((o) => ({ kind: "order" as const, o })),
      ...args.cashFlow.map((t) => ({ kind: "cash" as const, t })),
    ].sort((a, b) => {
      const at = a.kind === "order" ? a.o.created_at : a.t.created_at;
      const bt = b.kind === "order" ? b.o.created_at : b.t.created_at;
      return at < bt ? -1 : 1;
    });

    // Sums
    let totalDebit = 0;
    let totalCredit = 0;
    for (const r of timeline) {
      const v = valuesFor(r, args.kind);
      totalDebit += v.debit;
      totalCredit += v.credit;
    }

    const codePrefix = isCustomer ? "KH" : "NCC";
    const contactCode = `${codePrefix}${String(args.contact.id).padStart(6, "0")}`;

    // === Build workbook ===
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("CongNoChiTiet");

    // Column widths (12 cols A-L)
    ws.columns = [
      { width: 16 }, // A: Thời gian
      { width: 16 }, // B: Mã
      { width: 32 }, // C: Diễn giải
      { width: 10 }, // D: ĐVT
      { width: 8 }, // E: SL
      { width: 14 }, // F: Đơn giá
      { width: 12 }, // G: Giảm giá
      { width: 8 }, // H: VAT
      { width: 14 }, // I: Giá bán/trả
      { width: 16 }, // J: Thành tiền
      { width: 16 }, // K: Ghi nợ
      { width: 16 }, // L: Ghi có
    ];

    // Row 1: shop name
    const r1 = ws.getRow(1);
    r1.getCell(1).value = args.settings?.shop_name || "";
    r1.getCell(1).font = { bold: true, size: 14 };
    r1.height = 22;

    // Row 2-4: shop info
    const set = (rowNum: number, label: string, value: string) => {
      const r = ws.getRow(rowNum);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true };
      r.getCell(2).value = value;
    };
    set(2, "Chi nhánh", args.settings?.shop_address || "Chi nhánh trung tâm");
    set(3, "Địa chỉ", args.settings?.shop_address || "");
    set(4, "Điện thoại", args.settings?.shop_phone || "");

    // Row 5: title merged A-L
    ws.mergeCells("A5:L5");
    const titleCell = ws.getCell("A5");
    titleCell.value = isCustomer
      ? "CÔNG NỢ CHI TIẾT KHÁCH HÀNG"
      : "CÔNG NỢ CHI TIẾT NHÀ CUNG CẤP";
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    titleCell.fill = HEADER_FILL;
    ws.getRow(5).height = 32;

    // Rows 6-8: contact info (left) + period summary (right)
    const setContactRow = (
      rowNum: number,
      label: string,
      value: string | number,
      periodLabel: string,
      periodValueK: number | string,
      periodValueL?: number | string,
    ) => {
      const r = ws.getRow(rowNum);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true };
      r.getCell(2).value = value;
      r.getCell(10).value = periodLabel;
      r.getCell(10).font = { bold: true };
      r.getCell(10).alignment = { horizontal: "right" };
      r.getCell(11).value = periodValueK;
      r.getCell(11).numFmt = MONEY_FMT;
      r.getCell(11).font = { bold: true };
      r.getCell(11).alignment = { horizontal: "right" };
      if (periodValueL !== undefined) {
        r.getCell(12).value = periodValueL;
        r.getCell(12).numFmt = MONEY_FMT;
        r.getCell(12).font = { bold: true };
        r.getCell(12).alignment = { horizontal: "right" };
      }
    };
    setContactRow(
      6,
      isCustomer ? "Khách hàng" : "Nhà cung cấp",
      args.contact.name,
      "Nợ đầu kỳ",
      0,
    );
    setContactRow(
      7,
      isCustomer ? "Mã KH" : "Mã NCC",
      contactCode,
      "Phát sinh trong kỳ",
      totalDebit,
      totalCredit,
    );
    setContactRow(
      8,
      "Điện thoại",
      args.contact.phone || "",
      "Nợ cuối kỳ",
      args.contact.debt_amount,
    );

    // Row 9: empty (skip)

    // Row 10: column headers
    const HEADERS = [
      "Thời gian",
      "Mã",
      "Diễn giải",
      "ĐVT",
      "SL",
      "Đơn giá",
      "Giảm giá",
      "VAT",
      "Giá bán/trả",
      "Thành tiền",
      "Ghi nợ",
      "Ghi có",
    ];
    const hRow = ws.getRow(10);
    hRow.height = 28;
    HEADERS.forEach((h, i) => {
      const c = hRow.getCell(i + 1);
      c.value = h;
      c.font = { bold: true };
      c.fill = HEADER_FILL;
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      c.border = THIN_BORDER;
    });

    // === Data rows ===
    let r = 11;
    const applyParentStyle = (row: ExcelJS.Row) => {
      row.height = 22;
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.border = THIN_BORDER;
        cell.fill = PARENT_FILL;
        cell.font = { bold: true };
        if (c >= 5) cell.alignment = { horizontal: "right", vertical: "middle" };
        else cell.alignment = { vertical: "middle" };
        if (c === 11 || c === 12) cell.numFmt = MONEY_FMT;
      }
    };
    const applyItemStyle = (row: ExcelJS.Row) => {
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        cell.border = THIN_BORDER;
        if (c >= 5) cell.alignment = { horizontal: "right", vertical: "middle" };
        else cell.alignment = { vertical: "middle" };
        if (c === 5) cell.numFmt = QTY_FMT;
        else if (c >= 6 && c <= 12) cell.numFmt = MONEY_FMT;
      }
    };

    for (const item of timeline) {
      if (item.kind === "order") {
        const row = ws.getRow(r);
        row.getCell(1).value = formatDateTimeForCell(item.o.created_at);
        row.getCell(2).value = item.o.code;
        row.getCell(3).value = orderTypeLabel(item.o.type);
        const v = valuesFor(item, args.kind);
        if (v.debit > 0) row.getCell(11).value = v.debit;
        if (v.credit > 0) row.getCell(12).value = v.credit;
        applyParentStyle(row);
        r++;

        const items = itemsByOrder.get(item.o.id) ?? [];
        for (const it of items) {
          const itemRow = ws.getRow(r);
          itemRow.getCell(2).value = it.sku;
          itemRow.getCell(3).value = it.product_name;
          itemRow.getCell(4).value = it.unit_name || it.base_unit;
          itemRow.getCell(5).value = it.qty;
          itemRow.getCell(6).value = it.price;
          itemRow.getCell(7).value = it.discount || 0;
          itemRow.getCell(8).value = 0;
          itemRow.getCell(9).value = it.price;
          itemRow.getCell(10).value = it.total;
          applyItemStyle(itemRow);
          // Align col 3 left for product name readability
          itemRow.getCell(3).alignment = { horizontal: "left", vertical: "middle" };
          r++;
        }
      } else {
        const row = ws.getRow(r);
        row.getCell(1).value = formatDateTimeForCell(item.t.created_at);
        row.getCell(2).value = item.t.category || "";
        const reducesDebt =
          (args.kind === "customer" && item.t.type === "in") ||
          (args.kind === "supplier" && item.t.type === "out");
        row.getCell(3).value = reducesDebt ? "Thanh toán" : "Hoàn tiền";
        const v = valuesFor(item, args.kind);
        if (v.debit > 0) row.getCell(11).value = v.debit;
        if (v.credit > 0) row.getCell(12).value = v.credit;
        applyParentStyle(row);
        r++;
      }
    }

    // Freeze top section (rows 1-10) for easier scrolling
    ws.views = [{ state: "frozen", ySplit: 10 }];

    // Write buffer
    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const u8 = new Uint8Array(buf);

    // Save dialog
    const defaultName = `CongNoChiTiet_${contactCode}_${toISODate(new Date())}.xlsx`;
    const target = await save({
      title: "Xuất công nợ chi tiết",
      defaultPath: defaultName,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!target) return { ok: false, reason: "cancelled" };

    await invoke("save_bytes", {
      path: target,
      bytes: Array.from(u8),
    });
    try {
      await invoke("open_path_in_os", { path: target });
    } catch (e) {
      console.warn("[excelExport] open file failed:", e);
    }
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message };
  }
}
