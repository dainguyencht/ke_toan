import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelOrder,
  createPurchase,
  createReturn,
  createSale,
  getOrderById,
  getOrderItems,
  listOrders,
  listOrdersByContact,
  listOrdersByProduct,
  payOrderDebt,
  type DateFilter,
  type PurchaseInput,
  type ReturnInput,
  type SaleInput,
} from "@/db/orders";
import type { OrderType } from "@/domain/types";

const KEY = ["orders"] as const;

export function useOrders(
  type: OrderType | "all" = "all",
  dateFilter: DateFilter = {},
) {
  return useQuery({
    queryKey: [...KEY, "list", type, dateFilter.from ?? null, dateFilter.to ?? null],
    queryFn: () => listOrders(type, dateFilter),
  });
}

export function useOrderItems(orderId: number | null) {
  return useQuery({
    queryKey: [...KEY, "items", orderId],
    queryFn: () => (orderId ? getOrderItems(orderId) : Promise.resolve([])),
    enabled: orderId != null,
  });
}

export function useOrdersByProduct(
  productId: number | null,
  dateFilter: DateFilter = {},
) {
  return useQuery({
    queryKey: [
      ...KEY,
      "by-product",
      productId,
      dateFilter.from ?? null,
      dateFilter.to ?? null,
    ],
    queryFn: () =>
      productId
        ? listOrdersByProduct(productId, dateFilter)
        : Promise.resolve([]),
    enabled: productId != null,
  });
}

export function useOrdersByContact(
  kind: "customer" | "supplier",
  contactId: number | null,
) {
  return useQuery({
    queryKey: [...KEY, "by-contact", kind, contactId],
    queryFn: () =>
      contactId ? listOrdersByContact(kind, contactId) : Promise.resolve([]),
    enabled: contactId != null,
  });
}

export function useOrder(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => (id ? getOrderById(id) : Promise.resolve(null)),
    enabled: id != null,
  });
}

export function usePayOrderDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      amount,
      note,
    }: {
      orderId: number;
      amount: number;
      note?: string | null;
    }) => payOrderDebt(orderId, amount, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
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

export function useCreateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnInput) => createReturn(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
