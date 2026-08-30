import React from "react";
import { Button } from "@/components/ui/button";
import { exportLog, pushLog } from "@/lib/logger";
import { toast } from "sonner";

type Props = { children: React.ReactNode };
type State = { err: Error | null };

/**
 * Bắt lỗi render của cây React (thay vì để màn hình trắng). Hiện thông báo +
 * nút Xuất log để user gửi hỗ trợ, và nút Tải lại.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: React.ErrorInfo): void {
    pushLog("error", "React ErrorBoundary:", err, info.componentStack ?? "");
  }

  handleExport = async () => {
    const ok = await exportLog();
    toast[ok ? "success" : "error"](
      ok ? "Đã xuất log" : "Không xuất được file - log đã chép vào clipboard",
    );
  };

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="max-w-xl mx-auto mt-[10vh] p-6">
        <h1 className="text-xl font-semibold text-neutral-900 mb-2">
          Ứng dụng gặp lỗi
        </h1>
        <p className="text-neutral-500 leading-relaxed mb-4">
          Đã có lỗi khiến màn hình không hiển thị đúng. Vui lòng bấm{" "}
          <strong>Xuất log</strong> rồi gửi file cho bộ phận hỗ trợ, sau đó bấm{" "}
          <strong>Tải lại</strong>.
        </p>
        <pre className="text-xs bg-neutral-100 border border-neutral-200 rounded p-3 mb-4 max-h-48 overflow-auto whitespace-pre-wrap">
          {this.state.err.name}: {this.state.err.message}
          {"\n"}
          {this.state.err.stack}
        </pre>
        <div className="flex gap-2">
          <Button onClick={this.handleExport}>Xuất log</Button>
          <Button variant="outline" onClick={() => location.reload()}>
            Tải lại
          </Button>
        </div>
      </div>
    );
  }
}
