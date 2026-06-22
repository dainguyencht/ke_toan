import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Có thể là string (auto split theo \n) hoặc ReactNode. */
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  destructive = false,
  busy = false,
  onConfirm,
}: Props) {
  const renderMessage = () => {
    if (message == null) return null;
    if (typeof message !== "string") return message;
    return message.split("\n").map((line, i) => (
      <p key={i} className={i > 0 ? "mt-1.5" : ""}>
        {line}
      </p>
    ));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {message && (
          <div className="text-sm text-neutral-600 leading-relaxed">
            {renderMessage()}
          </div>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? "Đang xử lý..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
