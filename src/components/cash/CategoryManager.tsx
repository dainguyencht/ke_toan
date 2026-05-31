import { useState } from "react";
import { Pencil, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  useAddCustomCashCategory,
  useCustomCashCategories,
  useRemoveCustomCashCategory,
  useRenameCustomCashCategory,
} from "@/hooks/useCash";
import { countTransactionsByCategory } from "@/db/cash";
import { toast } from "sonner";

const BUILTINS_IN = ["Thu công nợ KH", "Vốn chủ thêm vào"];
const BUILTINS_OUT = [
  "Lương nhân viên",
  "Tiền điện",
  "Tiền nước",
  "Tiền thuê mặt bằng",
  "Phí vận chuyển",
  "Rút vốn",
];

type Type = "in" | "out";

export function CategoryManager() {
  const [type, setType] = useState<Type>("out");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Quản lý danh mục</h2>
        <p className="text-sm text-neutral-500 mt-1">
          Thêm, sửa, xoá danh mục thu/chi. Danh mục mặc định không thể sửa hay xoá.
        </p>
      </div>

      <Tabs value={type} onValueChange={(v) => setType(v as Type)}>
        <TabsList>
          <TabsTrigger value="out">Danh mục chi</TabsTrigger>
          <TabsTrigger value="in">Danh mục thu</TabsTrigger>
        </TabsList>
      </Tabs>

      <CategoryList type={type} />
    </div>
  );
}

function CategoryList({ type }: { type: Type }) {
  const { data: customCats = [] } = useCustomCashCategories(type);
  const addCat = useAddCustomCashCategory();
  const removeCat = useRemoveCustomCashCategory();
  const renameCat = useRenameCustomCashCategory();

  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const builtins = type === "in" ? BUILTINS_IN : BUILTINS_OUT;
  const all = [
    ...builtins.map((name) => ({ name, builtin: true })),
    ...customCats.map((name) => ({ name, builtin: false })),
  ];

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error("Tên danh mục không được để trống");
      return;
    }
    if (all.some((c) => c.name === name) || name === "Khác") {
      toast.error("Danh mục đã tồn tại");
      return;
    }
    try {
      await addCat.mutateAsync({ type, name });
      setNewName("");
      toast.success("Đã thêm danh mục");
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleRename = async (oldName: string) => {
    const newN = editName.trim();
    if (!newN || newN === oldName) {
      setEditing(null);
      return;
    }
    try {
      await renameCat.mutateAsync({ type, oldName, newName: newN });
      toast.success(`Đã đổi "${oldName}" → "${newN}"`);
      setEditing(null);
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  const handleDelete = async (name: string) => {
    try {
      const count = await countTransactionsByCategory(type, name);
      const msg =
        count > 0
          ? `Danh mục "${name}" đang được dùng trong ${count} giao dịch. ` +
            `Xoá sẽ không ảnh hưởng giao dịch cũ (vẫn giữ tên này), nhưng danh mục sẽ không còn trong dropdown. Tiếp tục?`
          : `Xoá danh mục "${name}"?`;
      if (!confirm(msg)) return;
      await removeCat.mutateAsync({ type, name });
      toast.success("Đã xoá danh mục");
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-3">
      {/* Form thêm mới */}
      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={
            type === "in"
              ? "VD: Thu khác từ khách lẻ"
              : "VD: Phí internet"
          }
          className="max-w-md"
        />
        <Button onClick={handleAdd} disabled={addCat.isPending}>
          <Plus className="w-4 h-4" />
          Thêm danh mục
        </Button>
      </div>

      {/* Bảng */}
      <div className="border border-neutral-200 rounded-md bg-white">
        <Table>
          <THead>
            <TR>
              <TH>Danh mục</TH>
              <TH>Loại</TH>
              <TH className="w-32 text-right">Thao tác</TH>
            </TR>
          </THead>
          <TBody>
            {all.length === 0 ? (
              <TR>
                <TD colSpan={3} className="text-center text-neutral-500 py-6">
                  Chưa có danh mục nào.
                </TD>
              </TR>
            ) : (
              all.map((c) => (
                <TR key={c.name}>
                  <TD>
                    {editing === c.name ? (
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleRename(c.name);
                          } else if (e.key === "Escape") {
                            setEditing(null);
                          }
                        }}
                        className="h-8 max-w-xs"
                      />
                    ) : (
                      <span className="font-medium">{c.name}</span>
                    )}
                  </TD>
                  <TD>
                    {c.builtin ? (
                      <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                        Mặc định
                      </span>
                    ) : (
                      <span className="text-xs text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                        Tự thêm
                      </span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {c.builtin ? (
                        <span className="text-xs text-neutral-400">—</span>
                      ) : editing === c.name ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRename(c.name)}
                            title="Lưu"
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(null)}
                            title="Huỷ"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditing(c.name);
                              setEditName(c.name);
                            }}
                            title="Sửa"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(c.name)}
                            title="Xoá"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
