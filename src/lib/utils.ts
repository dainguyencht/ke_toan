import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatVND(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format số thập phân theo locale vi-VN (dùng dấu `,` ngăn cách thập phân,
 * `.` ngăn cách hàng nghìn). Tối đa 2 chữ số sau dấu phẩy, không hiện 0 thừa.
 *   formatNumber(2.567) → "2,57"
 *   formatNumber(1.5)   → "1,5"
 *   formatNumber(1)     → "1"
 *   formatNumber(1234.5)→ "1.234,5"
 */
export function formatNumber(value: number, maxDecimals = 2): string {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits: maxDecimals,
  }).format(value);
}

/**
 * Format phần trăm với dấu `,`, mặc định 1 chữ số sau dấu phẩy.
 *   formatPercent(33.333) → "33,3%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return (
    new Intl.NumberFormat("vi-VN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + "%"
  );
}

/**
 * Chuỗi/Date → Date hợp lệ, hoặc null nếu không parse được.
 * Dữ liệu cũ có thể chứa ngày hỏng (vd năm 2 chữ số '0020-08-30 15:46:00' do gõ
 * nhầm ô năm) — Intl sẽ ném RangeError làm trắng cả trang, nên phải chặn ở đây.
 */
function safeDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return d instanceof Date && !isNaN(d.getTime()) ? d : null;
}

export function formatDate(value: string | Date): string {
  const d = safeDate(value);
  if (!d) return value ? String(value) : "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date): string {
  const d = safeDate(value);
  if (!d) return value ? String(value) : "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** ISO date string 'YYYY-MM-DD' theo giờ LOCAL — dùng làm filter so với
 * date(created_at) (cũng lưu local). toISOString() trả UTC nên sai sớm/khuya. */
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Date → 'YYYY-MM-DD HH:MM:SS' theo giờ LOCAL — định dạng lưu created_at.
 * Dùng giờ local (không phải UTC) để hiển thị lại đúng với giờ người dùng nhập.
 */
export function dbDateTime(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** Chuỗi created_at hoặc Date → value cho <input type="datetime-local"> ('YYYY-MM-DDTHH:mm').
 * Ngày hỏng → lấy thời điểm hiện tại để dialog sửa ngày vẫn mở được. */
export function toDateTimeLocalValue(value: string | Date): string {
  const d = safeDate(value) ?? new Date();
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
}

/**
 * Value từ <input type="datetime-local"> ('YYYY-MM-DDTHH:mm') → 'YYYY-MM-DD HH:MM:SS' để lưu DB.
 * Chỉ nhận chuỗi parse được; giá trị lạ (vd năm 2 chữ số '0020-08-30T15:46' do gõ
 * nhầm ô năm) sẽ bị chặn và thay bằng thời điểm hiện tại, tránh ghi ngày hỏng vào DB.
 */
export function dateTimeLocalToDb(v: string): string {
  if (!v) return dbDateTime();
  const raw = v.replace("T", " ") + (v.length === 16 ? ":00" : "");
  const d = safeDate(raw);
  if (!d) {
    console.warn(`[dateTimeLocalToDb] ngày không hợp lệ: "${v}" - dùng giờ hiện tại`);
    return dbDateTime();
  }
  return dbDateTime(d);
}

/** Lấy 'YYYY-MM-DD' cho N ngày trước (0 = hôm nay) */
export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d);
}

/** Ngày đầu tháng hiện tại (local) */
export function startOfMonth(d: Date = new Date()): string {
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Ngày đầu quý hiện tại (Q1=tháng 1, Q2=tháng 4, Q3=tháng 7, Q4=tháng 10) */
export function startOfQuarter(d: Date = new Date()): string {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return toISODate(new Date(d.getFullYear(), q, 1));
}

/** Ngày 1/1 năm hiện tại */
export function startOfYear(d: Date = new Date()): string {
  return toISODate(new Date(d.getFullYear(), 0, 1));
}
