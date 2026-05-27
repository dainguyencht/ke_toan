import { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { InvoiceLayout } from "@/components/orders/InvoiceLayout";
import type { OrderItem } from "@/domain/types";

export const PRINT_DATA_KEY = "__invoice_print_data";

export type InvoicePrintData = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  shopBank: string;
  orderDate: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: Array<
    OrderItem & { sku: string; product_name: string; base_unit: string }
  >;
  orderTotal: number;
  orderPaid: number;
  oldDebt: number;
  currentDebt: number;
  invoiceNote: string;
  /** Cỡ chữ base px (15 = vừa). Tùy chọn — mặc định dùng default trong CSS. */
  fontSize?: number;
  /** Khổ giấy in. Mặc định A5. */
  paperSize?: "A3" | "A4" | "A5";
  /** Chiều giấy. Mặc định landscape. */
  orientation?: "landscape" | "portrait";
};

export default function PrintInvoice() {
  const [data, setData] = useState<InvoicePrintData | null>(null);

  useEffect(() => {
    // Title rỗng → một số browser dùng title cho header in, đặt rỗng tránh hiện
    document.title = " ";
    const raw = localStorage.getItem(PRINT_DATA_KEY);
    if (raw) {
      try {
        setData(JSON.parse(raw) as InvoicePrintData);
      } catch {
        // ignore parse error
      }
      localStorage.removeItem(PRINT_DATA_KEY);
    }
  }, []);

  // Inject @page rule động theo paperSize + orientation user chọn
  useEffect(() => {
    if (!data) return;
    const styleId = "dynamic-print-page-style";
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    const size = data.paperSize ?? "A5";
    const orient = data.orientation ?? "landscape";
    styleEl.textContent = `
      @page {
        size: ${size} ${orient};
        margin: 0;
        @top-left { content: ""; }
        @top-center { content: ""; }
        @top-right { content: ""; }
        @bottom-left { content: ""; }
        @bottom-center { content: ""; }
        @bottom-right { content: ""; }
      }
    `;
    return () => {
      // optional cleanup khi unmount
      styleEl?.remove();
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        console.error("print error", e);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data]);

  useEffect(() => {
    const onAfterPrint = () => {
      void getCurrentWebviewWindow().close();
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  if (!data) {
    return (
      <div style={{ padding: 20, fontFamily: "system-ui" }}>Đang tải...</div>
    );
  }

  return (
    <div
      style={{
        padding: "8mm 10mm",
        background: "white",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <InvoiceLayout {...data} />
    </div>
  );
}
