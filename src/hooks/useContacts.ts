import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContact,
  createDebtAdjustment,
  deleteContact,
  deleteDebtAdjustment,
  deleteDebtPayment,
  getContact,
  getTotalDebt,
  listContacts,
  listDebtAdjustments,
  payDebt,
  setContactDebt,
  updateContact,
  type ContactInput,
  type ContactKind,
} from "@/db/contacts";

const KEY = (kind: ContactKind) => ["contacts", kind] as const;

export function useContacts(kind: ContactKind, search: string) {
  return useQuery({
    queryKey: [...KEY(kind), "list", search],
    queryFn: () => listContacts(kind, search),
  });
}

export function useTotalDebt(kind: ContactKind) {
  return useQuery({
    queryKey: [...KEY(kind), "total-debt"],
    queryFn: () => getTotalDebt(kind),
  });
}

export function useContact(kind: ContactKind, id: number | null) {
  return useQuery({
    queryKey: [...KEY(kind), "detail", id],
    queryFn: () => (id ? getContact(kind, id) : Promise.resolve(null)),
    enabled: id != null,
  });
}

export function useCreateContact(kind: ContactKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactInput) => createContact(kind, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(kind) }),
  });
}

export function useUpdateContact(kind: ContactKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ContactInput }) =>
      updateContact(kind, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(kind) }),
  });
}

export function useDeleteContact(kind: ContactKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteContact(kind, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(kind) }),
  });
}

export function useSyncContactDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      contactId,
      newDebt,
    }: {
      kind: ContactKind;
      contactId: number;
      newDebt: number;
    }) => setContactDebt(kind, contactId, newDebt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteDebtPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDebtPayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDebtAdjustments(
  kind: ContactKind,
  contactId: number | null,
) {
  return useQuery({
    queryKey: [...KEY(kind), "debt-adjustments", contactId],
    queryFn: () =>
      contactId ? listDebtAdjustments(kind, contactId) : Promise.resolve([]),
    enabled: contactId != null,
  });
}

export function useCreateDebtAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      contactId,
      newDebt,
      note,
      createdAt,
    }: {
      kind: ContactKind;
      contactId: number;
      newDebt: number;
      note?: string | null;
      createdAt?: string;
    }) => createDebtAdjustment(kind, contactId, newDebt, note, createdAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useDeleteDebtAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDebtAdjustment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function usePayDebt(kind: ContactKind) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      contactId,
      amount,
      note,
      createdAt,
    }: {
      contactId: number;
      amount: number;
      note?: string | null;
      createdAt?: string;
    }) => payDebt(kind, contactId, amount, note, createdAt),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY(kind) });
      qc.invalidateQueries({ queryKey: ["cash"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
