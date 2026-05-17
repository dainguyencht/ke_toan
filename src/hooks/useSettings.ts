import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAllSettings, setMultiple, type SettingsMap } from "@/db/settings";

const KEY = ["settings"] as const;

export function useSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: getAllSettings,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: SettingsMap) => setMultiple(updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
