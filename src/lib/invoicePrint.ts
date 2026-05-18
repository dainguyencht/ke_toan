import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  PRINT_DATA_KEY,
  type InvoicePrintData,
} from "@/pages/PrintInvoice";

const PRINT_WINDOW_LABEL = "print-invoice";

export async function printInvoice(
  data: InvoicePrintData,
  title = "Hoá đơn",
): Promise<void> {
  localStorage.setItem(PRINT_DATA_KEY, JSON.stringify(data));

  const existing = await WebviewWindow.getByLabel(PRINT_WINDOW_LABEL);
  if (existing) {
    await existing.close();
    await new Promise((r) => setTimeout(r, 50));
  }

  const win = new WebviewWindow(PRINT_WINDOW_LABEL, {
    url: "/print-invoice",
    title,
    width: 900,
    height: 800,
    resizable: true,
    focus: true,
  });

  return new Promise((resolve, reject) => {
    const offCreated = win.once("tauri://created", () => {
      void offCreated.then((f) => f());
      resolve();
    });
    const offError = win.once("tauri://error", (e) => {
      void offError.then((f) => f());
      reject(new Error(`Không mở được cửa sổ in: ${String(e.payload)}`));
    });
  });
}
