import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installLogger, mountCrashFallbackIfBlank, pushLog } from "./lib/logger";
import "./index.css";

// Bắt console + lỗi global vào buffer ngay từ đầu, để lỗi sớm cũng có log.
installLogger();

// Chặn WebView2 (Windows) delegate "mở tab mới" sang trình duyệt mặc định.
// Nguyên nhân: middle-click, Ctrl/Cmd+click, hoặc target="_blank" link → WebView2
// fire NewWindowRequested → fallback ra trình duyệt hệ thống (vd: Cốc Cốc) với
// URL tauri.localhost của chính app, tạo cửa sổ rời gây khó chịu.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).open = () => null;

document.addEventListener("auxclick", (e) => {
  // middle-click (button 1) trên link → block
  if (e.button === 1) {
    const link = (e.target as HTMLElement)?.closest("a");
    if (link) e.preventDefault();
  }
});

document.addEventListener("click", (e) => {
  // Ctrl+click / Cmd+click trên link → block
  if (e.ctrlKey || e.metaKey) {
    const link = (e.target as HTMLElement)?.closest("a");
    if (link) e.preventDefault();
  }
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
} catch (err) {
  // Lỗi ngay lúc mount (chưa vào được ErrorBoundary) -> màn hình trắng.
  pushLog("error", "Mount app thất bại:", err);
  mountCrashFallbackIfBlank(true);
}
