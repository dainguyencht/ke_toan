import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useContact, useContacts } from "@/hooks/useContacts";
import { ContactForm } from "./ContactForm";
import type { ContactKind } from "@/db/contacts";

type Props = {
  kind: ContactKind;
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
};

export function ContactPicker({ kind, value, onChange, className }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [openForm, setOpenForm] = useState(false);
  const { data: contacts = [] } = useContacts(kind, query);
  const { data: selected } = useContact(kind, value);
  const filtered = contacts.slice(0, 50);

  const placeholder =
    kind === "customer" ? "Chọn / tìm khách hàng..." : "Chọn / tìm NCC...";

  // Khi đang tìm (focus + có gõ) → hiện query; ngược lại hiện tên đã chọn
  const inputValue = open ? query : (selected?.name ?? "");

  const handleSelect = (id: number) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };
  const handleClear = () => {
    onChange(null);
    setQuery("");
  };
  const handleAddNew = () => {
    setOpen(false);
    setOpenForm(true);
  };

  return (
    <>
      <div className={cn("relative", className)}>
        <Input
          value={inputValue}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className={value != null ? "pr-8" : ""}
        />
        {value != null && !open && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
            title="Bỏ chọn"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {open && (
          <div className="absolute z-50 left-0 right-0 mt-1 max-h-72 overflow-auto rounded-md border border-neutral-200 bg-white shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-neutral-500">
                {query ? `Không thấy ${kind === "customer" ? "KH" : "NCC"} khớp "${query}"` : "Không có dữ liệu"}
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(c.id)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
                >
                  <span className="text-neutral-800">{c.name}</span>
                  {c.phone && (
                    <span className="text-neutral-500 ml-2">· {c.phone}</span>
                  )}
                </button>
              ))
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleAddNew}
              className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 text-blue-700 border-t border-neutral-200 flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm {kind === "customer" ? "khách hàng" : "NCC"} mới
            </button>
          </div>
        )}
      </div>

      <ContactForm
        open={openForm}
        onOpenChange={setOpenForm}
        kind={kind}
        contact={null}
      />
    </>
  );
}

export { Plus };
