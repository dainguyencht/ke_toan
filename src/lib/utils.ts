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

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** ISO date string 'YYYY-MM-DD' cho query SQLite */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
