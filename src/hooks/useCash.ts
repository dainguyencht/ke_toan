import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addCustomCashCategory,
  countTransactionsByCategory,
  createCashTransaction,
  deleteCashTransaction,
  getCashSummary,
  listCashTransactions,
  listContactCashFlow,
  listCustomCashCategories,
  removeCustomCashCategory,
  renameCustomCashCategory,
  updateCashTransaction,
  updateCashTransactionDate,
  updateLinkedCash,
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

export function useContactCashFlow(
  kind: "customer" | "supplier",
  contactId: number | null,
) {
  return useQuery({
    queryKey: [...KEY, "contact-flow", kind, contactId],
    queryFn: () =>
      contactId
        ? listContactCashFlow(kind, contactId)
        : Promise.resolve([]),
    enabled: contactId != null,
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

export function useUpdateCashTransactionDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, createdAt }: { id: number; createdAt: string }) =>
      updateCashTransactionDate(id, createdAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateLinkedCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      amount,
      createdAt,
    }: {
      id: number;
      amount: number;
      createdAt: string;
    }) => updateLinkedCash(id, amount, createdAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteCashTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCashTransaction(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCustomCashCategories(type: "in" | "out") {
  return useQuery({
    queryKey: [...KEY, "categories", type],
    queryFn: () => listCustomCashCategories(type),
  });
}

export function useAddCustomCashCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, name }: { type: "in" | "out"; name: string }) =>
      addCustomCashCategory(type, name),
    onSuccess: (_, { type }) =>
      qc.invalidateQueries({ queryKey: [...KEY, "categories", type] }),
  });
}

export function useRemoveCustomCashCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ type, name }: { type: "in" | "out"; name: string }) =>
      removeCustomCashCategory(type, name),
    onSuccess: (_, { type }) =>
      qc.invalidateQueries({ queryKey: [...KEY, "categories", type] }),
  });
}

export function useRenameCustomCashCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      oldName,
      newName,
    }: {
      type: "in" | "out";
      oldName: string;
      newName: string;
    }) => renameCustomCashCategory(type, oldName, newName),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCountTransactionsByCategory(
  type: "in" | "out",
  name: string | null,
) {
  return useQuery({
    queryKey: [...KEY, "category-count", type, name],
    queryFn: () =>
      name ? countTransactionsByCategory(type, name) : Promise.resolve(0),
    enabled: name != null,
  });
}
