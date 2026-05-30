import { useState } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettings } from "@/hooks/useSettings";
import { hashPassword } from "@/lib/passwordHash";
import { toast } from "sonner";

const UNLOCK_KEY = "__view_pwd_unlocked";

type Props = {
  children: React.ReactNode;
};

/**
 * Bọc các page nhạy cảm (Tổng quan, Báo cáo). Nếu đã đặt mật khẩu trong
 * Cài đặt, user phải nhập đúng mới xem được. Trạng thái mở khoá lưu
 * sessionStorage (mở app lại sẽ phải nhập lại).
 */
export function PasswordGate({ children }: Props) {
  const { data: settings, isLoading } = useSettings();
  const expected = settings?.view_password_hash;
  const [unlocked, setUnlocked] = useState<boolean>(
    typeof window !== "undefined" &&
      sessionStorage.getItem(UNLOCK_KEY) === "1",
  );
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) {
    return (
      <div className="p-6 text-neutral-500 text-sm">Đang tải...</div>
    );
  }

  // Chưa đặt mật khẩu hoặc đã mở khoá phiên này → render bình thường
  if (!expected || unlocked) {
    return <>{children}</>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) {
      toast.error("Nhập mật khẩu");
      return;
    }
    setSubmitting(true);
    try {
      const hash = await hashPassword(input);
      if (hash === expected) {
        sessionStorage.setItem(UNLOCK_KEY, "1");
        setUnlocked(true);
        toast.success("Đã mở khoá");
      } else {
        toast.error("Sai mật khẩu");
        setInput("");
      }
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm border border-neutral-200 rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold">Cần mật khẩu</h2>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          Trang này được bảo vệ. Vui lòng nhập mật khẩu để xem.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Mật khẩu</Label>
            <Input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Đang kiểm tra..." : "Mở khoá"}
          </Button>
        </form>
      </div>
    </div>
  );
}
