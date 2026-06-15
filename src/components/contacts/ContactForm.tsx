import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useCreateContact,
  useCreateDebtAdjustment,
  useUpdateContact,
} from "@/hooks/useContacts";
import type { Contact, ContactKind } from "@/db/contacts";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: ContactKind;
  contact?: Contact | null;
};

type FormState = {
  name: string;
  phone: string;
  address: string;
  note: string;
  debt: number;
};

const EMPTY: FormState = { name: "", phone: "", address: "", note: "", debt: 0 };

const LABEL: Record<ContactKind, string> = {
  customer: "khách hàng",
  supplier: "nhà cung cấp",
};

export function ContactForm({ open, onOpenChange, kind, contact }: Props) {
  const isEdit = !!contact;
  const [form, setForm] = useState<FormState>(EMPTY);
  const create = useCreateContact(kind);
  const update = useUpdateContact(kind);
  const adjustDebt = useCreateDebtAdjustment();

  useEffect(() => {
    if (open) {
      setForm(
        contact
          ? {
              name: contact.name,
              phone: contact.phone ?? "",
              address: contact.address ?? "",
              note: contact.note ?? "",
              debt: contact.debt_amount ?? 0,
            }
          : EMPTY,
      );
    }
  }, [open, contact]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Tên không được để trống");
      return;
    }

    const input = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      note: form.note.trim() || null,
    };

    try {
      let contactId: number;
      if (isEdit && contact) {
        await update.mutateAsync({ id: contact.id, input });
        contactId = contact.id;
      } else {
        contactId = await create.mutateAsync(input);
      }
      // Tạo phiếu điều chỉnh dư nợ nếu thay đổi
      const currentDebt = contact?.debt_amount ?? 0;
      if (form.debt !== currentDebt) {
        await adjustDebt.mutateAsync({
          kind,
          contactId,
          newDebt: form.debt,
          note: isEdit ? "Điều chỉnh dư nợ" : "Dư nợ ban đầu",
        });
      }
      toast.success(isEdit ? `Đã cập nhật ${LABEL[kind]}` : `Đã thêm ${LABEL[kind]}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const busy = create.isPending || update.isPending || adjustDebt.isPending;
  const title = `${isEdit ? "Sửa" : "Thêm"} ${LABEL[kind]}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Tên *">
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder={kind === "customer" ? "VD: Nguyễn Văn A" : "VD: Công ty TNHH ABC"}
              autoFocus
            />
          </Field>
          <Field label="Số điện thoại">
            <Input
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="VD: 0987654321"
            />
          </Field>
          <Field label="Địa chỉ">
            <Input
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
            />
          </Field>
          <Field label="Ghi chú">
            <Input
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </Field>
          {!isEdit && (
            <Field
              label={`Dư nợ ban đầu (VNĐ) — nếu ${kind === "customer" ? "KH" : "NCC"} đã có nợ trước khi thêm vào app`}
            >
              <NumberInput
                value={form.debt}
                onChange={(n) => set("debt", n)}
                placeholder="0"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Nhập số tiền nợ ban đầu nếu có. Tạo phiếu điều chỉnh, không ghi sổ quỹ. Sau này muốn điều chỉnh dùng nút máy tính trong danh sách.
              </p>
            </Field>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
