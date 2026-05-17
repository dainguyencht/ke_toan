import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateContact, useUpdateContact } from "@/hooks/useContacts";
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
};

const EMPTY: FormState = { name: "", phone: "", address: "", note: "" };

const LABEL: Record<ContactKind, string> = {
  customer: "khách hàng",
  supplier: "nhà cung cấp",
};

export function ContactForm({ open, onOpenChange, kind, contact }: Props) {
  const isEdit = !!contact;
  const [form, setForm] = useState<FormState>(EMPTY);
  const create = useCreateContact(kind);
  const update = useUpdateContact(kind);

  useEffect(() => {
    if (open) {
      setForm(
        contact
          ? {
              name: contact.name,
              phone: contact.phone ?? "",
              address: contact.address ?? "",
              note: contact.note ?? "",
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
      if (isEdit && contact) {
        await update.mutateAsync({ id: contact.id, input });
        toast.success(`Đã cập nhật ${LABEL[kind]}`);
      } else {
        await create.mutateAsync(input);
        toast.success(`Đã thêm ${LABEL[kind]}`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const busy = create.isPending || update.isPending;
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
