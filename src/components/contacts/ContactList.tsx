import { useState } from "react";
import { Plus, Pencil, Trash2, Search, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Abbr } from "@/components/ui/abbr";
import { ContactForm } from "./ContactForm";
import { PayDebtDialog } from "./PayDebtDialog";
import { ContactOrdersDialog } from "./ContactOrdersDialog";
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
  const [viewingOrders, setViewingOrders] = useState<Contact | null>(null);

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
                <TH>
                  <Abbr title="Số điện thoại">SĐT</Abbr>
                </TH>
                <TH>Địa chỉ</TH>
                <TH className="text-right">
                  <Abbr title="Dương = còn nợ; âm = trả trước">Dư nợ</Abbr>
                </TH>
                <TH className="w-20"></TH>
              </TR>
            </THead>
            <TBody>
              {data.map((c) => (
                <TR
                  key={c.id}
                  onClick={() => setViewingOrders(c)}
                  className="cursor-pointer"
                  title={
                    kind === "customer"
                      ? "Xem phiếu bán của khách hàng này"
                      : "Xem phiếu nhập từ NCC này"
                  }
                >
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="text-neutral-600">
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        onClick={(e) => e.stopPropagation()}
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
                          : c.debt_amount < 0
                            ? "text-green-700 font-medium"
                            : "text-neutral-400"
                      }
                    >
                      {formatVND(c.debt_amount)}
                    </span>
                  </TD>
                  <TD onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPayingDebt(c)}
                        className={
                          c.debt_amount > 0
                            ? "text-amber-700 border-amber-300 hover:bg-amber-50 hover:text-amber-800"
                            : ""
                        }
                        title={
                          c.debt_amount > 0
                            ? kind === "customer"
                              ? "Thu nợ KH"
                              : "Trả nợ NCC"
                            : "Ghi nhận thu/trả tiền (có thể trả trước)"
                        }
                      >
                        {kind === "customer" ? "Thu tiền" : "Trả tiền"}
                      </Button>
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
      <ContactOrdersDialog
        open={viewingOrders != null}
        onOpenChange={(o) => !o && setViewingOrders(null)}
        kind={kind}
        contact={viewingOrders}
      />
    </div>
  );
}
