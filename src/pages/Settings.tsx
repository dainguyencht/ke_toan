import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import {
  Download,
  Upload,
  Database,
  Save,
  RefreshCw,
  AlertCircle,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { formatDate, toISODate } from "@/lib/utils";
import { hashPassword } from "@/lib/passwordHash";
import { toast } from "sonner";

export default function Settings() {
  const { data: settings } = useSettings();
  const update = useUpdateSettings();

  // Form state cho thông tin shop
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [shopBankAccount, setShopBankAccount] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");
  const [invoiceFontSize, setInvoiceFontSize] = useState("15");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");

  const [dbPath, setDbPath] = useState<string>("");
  const [backups, setBackups] = useState<string[]>([]);

  // Mật khẩu xem Tổng quan / Báo cáo
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const hasPassword = !!settings?.view_password_hash;

  const verifyCurrentPwd = async (): Promise<boolean> => {
    if (!hasPassword) return true;
    if (!currentPwd) {
      toast.error("Nhập mật khẩu hiện tại");
      return false;
    }
    const hash = await hashPassword(currentPwd);
    if (hash !== settings?.view_password_hash) {
      toast.error("Mật khẩu hiện tại không đúng");
      return false;
    }
    return true;
  };

  const handleSavePassword = async () => {
    if (!newPwd) {
      toast.error("Nhập mật khẩu mới");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("Hai mật khẩu không khớp");
      return;
    }
    if (newPwd.length < 4) {
      toast.error("Mật khẩu tối thiểu 4 ký tự");
      return;
    }
    setSavingPwd(true);
    try {
      if (!(await verifyCurrentPwd())) return;
      const hash = await hashPassword(newPwd);
      await update.mutateAsync({ view_password_hash: hash });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      // Xoá unlock flag để buộc nhập lại với mật khẩu mới
      sessionStorage.removeItem("__view_pwd_unlocked");
      toast.success(hasPassword ? "Đã đổi mật khẩu" : "Đã đặt mật khẩu");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPwd(false);
    }
  };

  const handleRemovePassword = async () => {
    if (!hasPassword) return;
    if (!confirm("Xoá mật khẩu? Tổng quan và Báo cáo sẽ KHÔNG cần mật khẩu nữa.")) return;
    setSavingPwd(true);
    try {
      if (!(await verifyCurrentPwd())) return;
      await update.mutateAsync({ view_password_hash: "" });
      setCurrentPwd("");
      setNewPwd("");
      setConfirmPwd("");
      sessionStorage.removeItem("__view_pwd_unlocked");
      toast.success("Đã xoá mật khẩu");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPwd(false);
    }
  };

  useEffect(() => {
    if (settings) {
      setShopName(settings.shop_name ?? "");
      setShopAddress(settings.shop_address ?? "");
      setShopPhone(settings.shop_phone ?? "");
      setShopBankAccount(settings.shop_bank_account ?? "");
      setInvoiceNote(settings.invoice_note ?? "");
      setInvoiceFontSize(settings.invoice_font_size ?? "15");
      setLowStockThreshold(settings.low_stock_threshold ?? "5");
    }
  }, [settings]);

  useEffect(() => {
    void loadDbInfo();
  }, []);

  const loadDbInfo = async () => {
    try {
      const path = await invoke<string>("get_db_path");
      setDbPath(path);
      const list = await invoke<string[]>("list_auto_backups");
      setBackups(list);
    } catch (err) {
      console.error("loadDbInfo", err);
    }
  };

  const handleSaveShop = async () => {
    try {
      await update.mutateAsync({
        shop_name: shopName.trim(),
        shop_address: shopAddress.trim(),
        shop_phone: shopPhone.trim(),
        shop_bank_account: shopBankAccount.trim(),
        invoice_note: invoiceNote,
        invoice_font_size: String(Number(invoiceFontSize) || 15),
        low_stock_threshold: String(Number(lowStockThreshold) || 5),
      });
      toast.success("Đã lưu cài đặt");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleBackup = async () => {
    try {
      const target = await save({
        title: "Lưu file backup",
        defaultPath: `ke_toan_backup_${toISODate(new Date())}.db`,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!target) return;
      const saved = await invoke<string>("backup_db", { target });
      toast.success(`Đã sao lưu vào: ${saved}`);
      await loadDbInfo();
    } catch (err) {
      toast.error(`Lỗi backup: ${(err as Error).message}`);
    }
  };

  const handleRestore = async () => {
    try {
      const source = await open({
        title: "Chọn file backup để khôi phục",
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
        multiple: false,
      });
      if (!source || typeof source !== "string") return;
      const ok = confirm(
        `KHÔI PHỤC sẽ ghi đè TOÀN BỘ dữ liệu hiện tại bằng nội dung từ:\n\n${source}\n\nBản hiện tại sẽ được sao lưu vào ke_toan.db.before_restore.\n\nTiếp tục?`,
      );
      if (!ok) return;
      await invoke("restore_db", { source });
      toast.success("Khôi phục xong. Vui lòng ĐÓNG ỨNG DỤNG và MỞ LẠI để áp dụng.");
    } catch (err) {
      toast.error(`Lỗi khôi phục: ${(err as Error).message}`);
    }
  };

  // Path từ Rust dùng `/` trên macOS/Linux, `\` trên Windows — split cả 2
  const lastBackup = backups[0]
    ? backups[0].split(/[/\\]/).pop()?.replace("ke_toan_", "").replace(".db", "")
    : null;
  const lastBackupTs = lastBackup ? Number(lastBackup) : NaN;
  const lastBackupDate =
    Number.isFinite(lastBackupTs) && lastBackupTs > 0
      ? new Date(lastBackupTs * 1000)
      : null;

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Thông tin cửa hàng, sao lưu dữ liệu
        </p>
      </div>

      {/* Section: Thông tin cửa hàng */}
      <Section title="Thông tin cửa hàng">
        <div className="space-y-3">
          <Field label="Tên cửa hàng">
            <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
          </Field>
          <Field label="Địa chỉ">
            <Input
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
            />
          </Field>
          <Field label="Số điện thoại">
            <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} />
          </Field>
          <Field label="Số tài khoản ngân hàng (STK) — hiện trên hoá đơn">
            <Input
              value={shopBankAccount}
              onChange={(e) => setShopBankAccount(e.target.value)}
              placeholder="VD: 19027 456 789 01 - Vietcombank"
            />
          </Field>
          <Field label="Ghi chú trên hoá đơn (Lưu ý)">
            <textarea
              value={invoiceNote}
              onChange={(e) => setInvoiceNote(e.target.value)}
              rows={3}
              placeholder="VD: Hàng đổi trả trong 7 ngày, kèm hoá đơn..."
              className="flex w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            />
          </Field>
          <Field label="Cỡ chữ hoá đơn mặc định (px)">
            <select
              value={invoiceFontSize}
              onChange={(e) => setInvoiceFontSize(e.target.value)}
              className="flex h-9 max-w-32 rounded-md border border-neutral-300 bg-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map(
                (v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Ngưỡng cảnh báo tồn thấp (SP có tồn ≤ giá trị này sẽ cảnh báo)">
            <Input
              type="number"
              inputMode="numeric"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              className="max-w-32"
            />
          </Field>
          <div>
            <Button onClick={handleSaveShop} disabled={update.isPending}>
              <Save className="w-4 h-4" />
              {update.isPending ? "Đang lưu..." : "Lưu thay đổi"}
            </Button>
          </div>
        </div>
      </Section>

      {/* Section: Bảo mật — mật khẩu xem Tổng quan / Báo cáo */}
      <Section title="Bảo mật">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Lock className="w-4 h-4 text-neutral-500" />
            <span>
              Trạng thái:{" "}
              <strong
                className={hasPassword ? "text-green-700" : "text-neutral-500"}
              >
                {hasPassword ? "Đã đặt mật khẩu" : "Chưa đặt mật khẩu"}
              </strong>
            </span>
          </div>
          <p className="text-xs text-neutral-500">
            Khi đặt mật khẩu, hai trang <strong>Tổng quan</strong> và{" "}
            <strong>Báo cáo</strong> sẽ yêu cầu nhập mật khẩu trước khi xem.
            Trạng thái mở khoá hết khi đóng app.
          </p>
          {hasPassword && (
            <Field label="Mật khẩu hiện tại">
              <Input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                placeholder="Cần nhập để đổi / xoá"
                autoComplete="current-password"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={hasPassword ? "Mật khẩu mới" : "Mật khẩu"}>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Tối thiểu 4 ký tự"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Xác nhận mật khẩu">
              <Input
                type="password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSavePassword} disabled={savingPwd}>
              <Save className="w-4 h-4" />
              {savingPwd
                ? "Đang lưu..."
                : hasPassword
                  ? "Đổi mật khẩu"
                  : "Đặt mật khẩu"}
            </Button>
            {hasPassword && (
              <Button
                variant="outline"
                onClick={handleRemovePassword}
                disabled={savingPwd}
                className="text-red-700 border-red-300 hover:bg-red-50"
              >
                Xoá mật khẩu
              </Button>
            )}
          </div>
        </div>
      </Section>

      {/* Section: Sao lưu & Khôi phục */}
      <Section title="Sao lưu & Khôi phục">
        <div className="space-y-4">
          <InfoRow icon={<Database className="w-4 h-4" />} label="File DB hiện tại">
            <code className="text-xs bg-neutral-100 px-1.5 py-0.5 rounded break-all">
              {dbPath || "Đang tải..."}
            </code>
          </InfoRow>
          <InfoRow icon={<RefreshCw className="w-4 h-4" />} label="Auto-backup gần nhất">
            {lastBackupDate ? (
              <span>
                {formatDate(lastBackupDate)} {lastBackupDate.toLocaleTimeString("vi-VN")}{" "}
                <span className="text-neutral-400">
                  ({backups.length} bản còn giữ)
                </span>
              </span>
            ) : (
              <span className="text-neutral-400">Chưa có</span>
            )}
          </InfoRow>
          <p className="text-xs text-neutral-500 leading-relaxed">
            App tự sao lưu mỗi lần mở vào thư mục <code>backups/</code> bên cạnh DB,
            giữ <strong>7 bản</strong> gần nhất. Ngoài ra bạn nên sao lưu thủ công
            định kỳ ra USB hoặc cloud (Google Drive, iCloud Drive).
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleBackup}>
              <Download className="w-4 h-4" />
              Sao lưu ra file...
            </Button>
            <Button variant="outline" onClick={handleRestore}>
              <Upload className="w-4 h-4" />
              Khôi phục từ file...
            </Button>
          </div>
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Sau khi <strong>khôi phục</strong>, bạn cần đóng app và mở lại để DB
              load đúng dữ liệu mới.
            </span>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-neutral-200 rounded-md bg-white">
      <div className="px-4 py-3 border-b border-neutral-100">
        <h2 className="font-medium text-neutral-800">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
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

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-neutral-400 mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-neutral-500">{label}</div>
        <div className="text-neutral-800 mt-0.5">{children}</div>
      </div>
    </div>
  );
}
