import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useContacts } from "@/hooks/useContacts";
import { ContactForm } from "./ContactForm";
import type { ContactKind } from "@/db/contacts";

type Props = {
  kind: ContactKind;
  value: number | null;
  onChange: (id: number | null) => void;
  className?: string;
};

const ADD_VALUE = "__add__";

export function ContactPicker({ kind, value, onChange, className }: Props) {
  const [openForm, setOpenForm] = useState(false);
  const { data: contacts = [] } = useContacts(kind, "");

  const handleSelect = (v: string) => {
    if (v === ADD_VALUE) {
      setOpenForm(true);
      return;
    }
    onChange(v === "" ? null : Number(v));
  };

  return (
    <>
      <select
        value={value == null ? "" : String(value)}
        onChange={(e) => handleSelect(e.target.value)}
        className={cn(
          "flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          className,
        )}
      >
        <option value="">
          {kind === "customer" ? "-- Chọn khách hàng --" : "-- Chọn NCC --"}
        </option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} {c.phone ? `· ${c.phone}` : ""}
          </option>
        ))}
        <option value={ADD_VALUE}>
          {kind === "customer" ? "+ Thêm khách hàng mới..." : "+ Thêm NCC mới..."}
        </option>
      </select>

      <ContactForm
        open={openForm}
        onOpenChange={(o) => {
          setOpenForm(o);
        }}
        kind={kind}
        contact={null}
      />
    </>
  );
}

export { Plus };
