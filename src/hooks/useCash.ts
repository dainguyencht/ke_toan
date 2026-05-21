import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCashTransaction,
  deleteCashTransaction,
  getCashSummary,
  listCashTransactions,
  updateCashTransaction,
  type CashFilter,
  type CashInput,
} from "@/db/cash";

const KEY = ["cash"] as const;

export function useCashTransactions(filter: CashFilter) {
  return useQuery({
    queryKey: [...KEY, "list", filter],
    queryFn: () => listCashTransactions(filter),
  });
}

export function useCashSummary(filter: CashFilter) {
  return useQuery({
    queryKey: [...KEY, "summary", filter],
    queryFn: () => getCashSummary(filter),
  });
}

export function useCreateCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CashInput) => createCashTransaction(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CashInput }) =>
      updateCashTransaction(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCashTransaction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
