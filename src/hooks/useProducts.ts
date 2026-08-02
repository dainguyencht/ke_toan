import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveProduct,
  balanceStock,
  createProduct,
  getProduct,
  getTotalStockValue,
  listProducts,
  listStockAsOf,
  setInitialStock,
  updateProduct,
  type ProductInput,
  type StockCountEntry,
} from "@/db/products";
import type { UnitInput } from "@/db/units";

const KEY = ["products"] as const;

export function useProducts(search: string) {
  return useQuery({
    queryKey: [...KEY, "list", search],
    queryFn: () => listProducts(search),
  });
}

export function useTotalStockValue() {
  return useQuery({
    queryKey: [...KEY, "stock-value"],
    queryFn: () => getTotalStockValue(),
  });
}

export function useStockAsOf(date: string, search: string, enabled = true) {
  return useQuery({
    queryKey: [...KEY, "stock-asof", date, search],
    queryFn: () => listStockAsOf(date, search),
    enabled,
  });
}

export function useBalanceStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, entries }: { date: string; entries: StockCountEntry[] }) =>
      balanceStock(date, entries),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useProduct(id: number | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => (id ? getProduct(id) : Promise.resolve(null)),
    enabled: id != null,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: ProductInput & { initial_stock?: number; extra_units?: UnitInput[] },
    ) => {
      const id = await createProduct(input, input.extra_units ?? []);
      if (input.initial_stock && input.initial_stock > 0) {
        await setInitialStock(id, input.initial_stock);
      }
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["units"] });
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
      extra_units,
    }: {
      id: number;
      input: ProductInput;
      extra_units?: UnitInput[];
    }) => updateProduct(id, input, extra_units ?? []),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["units"] });
    },
  });
}

export function useArchiveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => archiveProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
