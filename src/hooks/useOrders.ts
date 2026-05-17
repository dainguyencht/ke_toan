import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelOrder,
  createPurchase,
  createSale,
  getOrderById,
  getOrderItems,
  listOrders,
  type PurchaseInput,
  type SaleInput,
} from "@/db/orders";
import type { OrderType } from "@/domain/types";

const KEY = ["orders"] as const;

export function useOrders(type: OrderType | "all" = "all") {
  return useQuery({
    queryKey: [...KEY, "list", type],
    queryFn: () => listOrders(type),
  });
}

export function useOrderItems(orderId: number | null) {
  return useQuery({
    queryKey: [...KEY, "items", orderId],
    queryFn: () => (orderId ? getOrderItems(orderId) : Promise.resolve([])),
    enabled: orderId != null,
  });
}

export function useOrder(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => (id ? getOrderById(id) : Promise.resolve(null)),
    enabled: id != null,
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => cancelOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PurchaseInput) => createPurchase(input),
    onSuccess: () => {
      // Invalidate orders, products (vì stock thay đổi), contacts (vì công nợ NCC thay đổi)
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["contacts", "supplier"] });
    },
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaleInput) => createSale(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["contacts", "customer"] });
    },
  });
}
