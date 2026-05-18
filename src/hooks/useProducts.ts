import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveProduct,
  createProduct,
  getProduct,
  listProducts,
  setInitialStock,
  updateProduct,
  type ProductInput,
} from "@/db/products";
import type { UnitInput } from "@/db/units";

const KEY = ["products"] as const;

export function useProducts(search: string) {
  return useQuery({
    queryKey: [...KEY, "list", search],
    queryFn: () => listProducts(search),
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
