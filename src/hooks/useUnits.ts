import { useQuery } from "@tanstack/react-query";
import { listUnitsOfProduct } from "@/db/units";

const KEY = ["units"] as const;

export function useUnitsOfProduct(productId: number | null) {
  return useQuery({
    queryKey: [...KEY, productId],
    queryFn: () =>
      productId ? listUnitsOfProduct(productId) : Promise.resolve([]),
    enabled: productId != null,
  });
}
