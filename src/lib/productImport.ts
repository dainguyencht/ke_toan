import * as XLSX from "xlsx";
import { getDb } from "@/db/client";
import { createProduct, setInitialStock } from "@/db/products";

export type ImportRow = {
  rowNum: number; // số dòng Excel (header = 1, data từ dòng 2)
  sku: string;
  name: string;
  barcode: string | null;
  unit: string;
  price_cost: number;
  price_sell: number;
  initial_stock: number;
  note: string | null;
  errors: string[];
};

export type ImportResult = {
  created: number;
  failed: number;
  errors: { rowNum: number; sku: string; reason: string }[];
};

const HEADERS = [
  "SKU",
  "Tên sản phẩm",
  "Mã vạch",
  "Đơn vị",
  "Giá vốn",
  "Giá bán",
  "Tồn đầu kỳ",
  "Ghi chú",
];

/** Parse Excel/CSV → mảng ImportRow, kèm errors per-row */
export async function parseProductFile(file: File): Promise<ImportRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("File rỗng hoặc không phải Excel hợp lệ");
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (raw.length === 0) return [];

  // Validate headers (case-sensitive nhưng linh hoạt với khoảng trắng)
  const firstRowKeys = Object.keys(raw[0]).map((k) => k.trim());
  const missing = ["SKU", "Tên sản phẩm"].filter((h) => !firstRowKeys.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `File thiếu cột bắt buộc: ${missing.join(", ")}. Hãy dùng đúng template.`,
    );
  }

  return raw.map((row, idx) => parseRow(row, idx + 2));
}

function parseRow(row: Record<string, unknown>, rowNum: number): ImportRow {
  const sku = String(row["SKU"] ?? "").trim();
  const name = String(row["Tên sản phẩm"] ?? "").trim();
  const barcode = String(row["Mã vạch"] ?? "").trim() || null;
  const unit = String(row["Đơn vị"] ?? "").trim() || "cái";
  const note = String(row["Ghi chú"] ?? "").trim() || null;
  const price_cost = parseNumber(row["Giá vốn"]);
  const price_sell = parseNumber(row["Giá bán"]);
  const initial_stock = parseNumber(row["Tồn đầu kỳ"]);

  const errors: string[] = [];
  if (!sku) errors.push("Thiếu SKU");
  if (!name) errors.push("Thiếu tên sản phẩm");
  if (price_cost < 0) errors.push("Giá vốn âm");
  if (price_sell < 0) errors.push("Giá bán âm");
  if (initial_stock < 0) errors.push("Tồn đầu kỳ âm");

  return {
    rowNum,
    sku,
    name,
    barcode,
    unit,
    price_cost,
    price_sell,
    initial_stock,
    note,
    errors,
  };
}

function parseNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Bổ sung errors do collision với DB hoặc trùng SKU trong file */
export async function validateAgainstDb(rows: ImportRow[]): Promise<ImportRow[]> {
  const db = await getDb();
  const existing = await db.select<{ sku: string }[]>(
    "SELECT sku FROM products",
  );
  const existingSet = new Set(existing.map((r) => r.sku));

  // Đếm SKU trong file để bắt trùng
  const fileSkuCount = new Map<string, number[]>();
  rows.forEach((r) => {
    if (!r.sku) return;
    const arr = fileSkuCount.get(r.sku) ?? [];
    arr.push(r.rowNum);
    fileSkuCount.set(r.sku, arr);
  });

  return rows.map((r) => {
    const extra: string[] = [];
    if (r.sku && existingSet.has(r.sku)) {
      extra.push("SKU đã tồn tại trong dữ liệu");
    }
    const dupRows = fileSkuCount.get(r.sku);
    if (dupRows && dupRows.length > 1) {
      const others = dupRows.filter((n) => n !== r.rowNum);
      extra.push(`SKU trùng với dòng ${others.join(", ")} trong file`);
    }
    return { ...r, errors: [...r.errors, ...extra] };
  });
}

/** Tạo template Excel với header + 2 dòng ví dụ */
export function generateTemplate(): Blob {
  const ws = XLSX.utils.aoa_to_sheet([
    HEADERS,
    ["SP001", "Áo polo nam size M trắng", "8934567890123", "cái", 150000, 250000, 20, ""],
    ["SP002", "Áo polo nam size L xanh", "", "cái", 150000, 250000, 15, "Hàng mới về"],
  ]);
  // Đặt độ rộng cột cho dễ đọc
  ws["!cols"] = [
    { wch: 10 }, // SKU
    { wch: 30 }, // Tên
    { wch: 15 }, // Mã vạch
    { wch: 8 },  // Đơn vị
    { wch: 12 }, // Giá vốn
    { wch: 12 }, // Giá bán
    { wch: 12 }, // Tồn
    { wch: 20 }, // Ghi chú
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sản phẩm");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Tải template về máy user */
export function downloadTemplate() {
  const blob = generateTemplate();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_san_pham.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Import các dòng hợp lệ vào DB. Bỏ qua dòng có errors. */
export async function importRows(rows: ImportRow[]): Promise<ImportResult> {
  const valid = rows.filter((r) => r.errors.length === 0);
  const result: ImportResult = { created: 0, failed: 0, errors: [] };

  for (const r of valid) {
    try {
      const id = await createProduct({
        sku: r.sku,
        name: r.name,
        barcode: r.barcode,
        unit: r.unit,
        price_cost: r.price_cost,
        price_sell: r.price_sell,
        note: r.note,
      });
      if (r.initial_stock > 0) {
        await setInitialStock(id, r.initial_stock);
      }
      result.created++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        rowNum: r.rowNum,
        sku: r.sku,
        reason: (err as Error).message,
      });
    }
  }
  return result;
}
