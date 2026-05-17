import { useQuery } from "@tanstack/react-query";
import {
  getDashboardStats,
  getDebtList,
  getLowStockItems,
  getProfitByProduct,
  getRevenueByDay,
  getStockValuation,
  getTopSellingProducts,
} from "@/db/reports";

const KEY = ["reports"] as const;

export function useDashboardStats() {
  return useQuery({
    queryKey: [...KEY, "dashboard"],
    queryFn: () => getDashboardStats(),
  });
}

export function useTopProducts(days: number) {
  return useQuery({
    queryKey: [...KEY, "top-products", days],
    queryFn: () => getTopSellingProducts(days),
  });
}

export function useLowStockItems(threshold = 5) {
  return useQuery({
    queryKey: [...KEY, "low-stock", threshold],
    queryFn: () => getLowStockItems(threshold),
  });
}

export function useRevenueByDay(days: number) {
  return useQuery({
    queryKey: [...KEY, "revenue-by-day", days],
    queryFn: () => getRevenueByDay(days),
  });
}

export function useProfitByProduct(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "profit", from, to],
    queryFn: () => getProfitByProduct(from, to),
  });
}

export function useStockValuation() {
  return useQuery({
    queryKey: [...KEY, "stock-valuation"],
    queryFn: () => getStockValuation(),
  });
}

export function useDebtList(kind: "customer" | "supplier") {
  return useQuery({
    queryKey: [...KEY, "debt", kind],
    queryFn: () => getDebtList(kind),
  });
}
