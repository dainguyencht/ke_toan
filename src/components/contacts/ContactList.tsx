import { useState } from "react";
import { Plus, Pencil, Trash2, Search, Phone, HandCoins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ContactForm } from "./ContactForm";
import { PayDebtDialog } from "./PayDebtDialog";
import { useContacts, useDeleteContact } from "@/hooks/useContacts";
import { formatVND } from "@/lib/utils";
import type { Contact, ContactKind } from "@/db/contacts";
import { toast } from "sonner";

type Props = {
  kind: ContactKind;
};

const LABEL: Record<ContactKind, { single: string; addBtn: string }> = {
  customer: { single: "khách hàng", addBtn: "Thêm khách hàng" },
  supplier: { single: "nhà cung cấp", addBtn: "Thêm NCC" },
};

export function ContactList({ kind }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [payingDebt, setPayingDebt] = useState<Contact | null>(null);

  const { data, isLoading, error } = useContacts(kind, search);
  const del = useDeleteContact(kind);
  const labels = LABEL[kind];

  const handleEdit = (c: Contact) => {
    setEditing(c);
    setOpen(true);
  };
  const handleNew = () => {
    setEditing(null);
    setOpen(true);
  };
  const handleDelete = async (c: Contact) => {
    if (!confirm(`Xóa ${labels.single} "${c.name}"?`)) return;
    try {
      await del.mutateAsync(c.id);
      toast.success(`Đã xóa ${labels.single}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên hoặc SĐT..."
            className="pl-9"
          />
        </div>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4" />
          {labels.addBtn}
        </Button>
      </div>

      <div className="border border-neutral-200 rounded-md bg-white">
        {error ? (
          <div className="p-6 text-red-600">Lỗi: {(error as Error).message}</div>
        ) : isLoading ? (
          <div className="p-6 text-neutral-500">Đang tải...</div>
        ) : !data?.length ? (
          <div className="p-12 text-center text-neutral-500">
            <p>Chưa có {labels.single} nào.</p>
            <Button variant="link" onClick={handleNew}>
              Thêm {labels.single} đầu tiên
            </Button>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Tên</TH>
                <TH>SĐT</TH>
                <TH>Địa chỉ</TH>
                <TH className="text-right">
                  {kind === "customer" ? "Công nợ phải thu" : "Công nợ phải trả"}
                </TH>
                <TH className="w-20"></TH>
              </TR>
            </THead>
            <TBody>
              {data.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="text-neutral-600">
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        className="inline-flex items-center gap-1 hover:text-brand-600"
                      >
                        <Phone className="w-3 h-3" />
                        {c.phone}
                      </a>
                    ) : (
                      "-"
                    )}
                  </TD>
                  <TD className="text-neutral-500 max-w-xs truncate">
                    {c.address ?? "-"}
                  </TD>
                  <TD className="text-right">
                    <span
                      className={
                        c.debt_amount > 0
                          ? "text-amber-600 font-medium"
                          : "text-neutral-400"
                      }
                    >
                      {formatVND(c.debt_amount)}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {c.debt_amount > 0 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setPayingDebt(c)}
                          title={kind === "customer" ? "Thu nợ" : "Trả nợ"}
                          className="text-amber-600 hover:text-amber-700"
                        >
                          <HandCoins className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(c)}
                        title="Sửa"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(c)}
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <ContactForm open={open} onOpenChange={setOpen} kind={kind} contact={editing} />
      <PayDebtDialog
        open={payingDebt != null}
        onOpenChange={(o) => !o && setPayingDebt(null)}
        kind={kind}
        contact={payingDebt}
      />
    </div>
  );
}
