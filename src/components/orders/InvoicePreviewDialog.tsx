import { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useContact } from "@/hooks/useContacts";
import { useOrderItems } from "@/hooks/useOrders";
import { useSettings } from "@/hooks/useSettings";
import { printInvoice } from "@/lib/invoicePrint";
import { toISODate } from "@/lib/utils";
import type { OrderListRow } from "@/db/orders";
import { InvoiceLayout } from "./InvoiceLayout";

type Props = {
  order: OrderListRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function InvoicePreviewDialog({ order, open, onOpenChange }: Props) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | "print" | null>(null);

  const { data: items = [] } = useOrderItems(open && order ? order.id : null);
  const { data: customer } = useContact(
    "customer",
    open && order?.customer_id ? order.customer_id : null,
  );
  const { data: settings } = useSettings();

  if (!order) return null;

  const thisDebt = Math.max(0, order.total - order.paid);
  const currentDebt = customer?.debt_amount ?? 0;
  const oldDebt = Math.max(0, currentDebt - thisDebt);

  const shopName = settings?.shop_name || "CỬA HÀNG";
  const shopAddress = settings?.shop_address || "";
  const shopPhone = settings?.shop_phone || "";
  const shopBank = settings?.shop_bank_account || "";
  const invoiceNote = settings?.invoice_note || "";

  const exportPdf = async () => {
    if (!previewRef.current) return;
    setExporting("pdf");
    const toastId = toast.loading("Đang tạo PDF...");
    try {
      const canvas = await html2canvas(previewRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      const imgData = canvas.toDataURL("image/jpeg", 0.95);

      if (imgH <= pageH) {
        pdf.addImage(imgData, "JPEG", 0, 0, imgW, imgH);
      } else {
        let position = 0;
        let remaining = imgH;
        while (remaining > 0) {
          pdf.addImage(imgData, "JPEG", 0, -position, imgW, imgH);
          remaining -= pageH;
          position += pageH;
          if (remaining > 0) pdf.addPage();
        }
      }

      const target = await save({
        title: "Lưu hoá đơn PDF",
        defaultPath: `hoadon_${order.code}_${toISODate(new Date())}.pdf`,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!target) {
        toast.dismiss(toastId);
        return;
      }
      const blob = pdf.output("blob");
      const buf = await blob.arrayBuffer();
      await invoke("save_bytes", {
        path: target,
        bytes: Array.from(new Uint8Array(buf)),
      });
      toast.success(`Đã lưu PDF: ${target}`, { id: toastId });
      try {
        await openPath(target);
      } catch {
        // ignore
      }
    } catch (err) {
      console.error("[invoice] PDF error:", err);
      toast.error(`Lỗi tạo PDF: ${(err as Error).message}`, { id: toastId });
    } finally {
      setExporting(null);
    }
  };

  const handlePrint = async () => {
    setExporting("print");
    try {
      await printInvoice(
        {
          shopName,
          shopAddress,
          shopPhone,
          shopBank,
          orderDate: order.created_at,
          customerName: customer?.name ?? order.partner_name ?? "",
          customerCompany: "",
          customerPhone: customer?.phone ?? "",
          customerAddress: customer?.address ?? "",
          items,
          orderTotal: order.total,
          orderPaid: order.paid,
          oldDebt,
          currentDebt,
          invoiceNote,
        },
        `Hoá đơn ${order.code}`,
      );
    } catch (err) {
      toast.error(`Lỗi in: ${(err as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const busy = exporting != null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle>Xem hoá đơn {order.code}</DialogTitle>
        </DialogHeader>

        {/* Preview — trông giống tờ giấy in A4 */}
        <div className="bg-neutral-100 p-4 rounded-md">
          <div
            ref={previewRef}
            className="bg-white mx-auto shadow"
            style={{
              width: "210mm",
              minHeight: "297mm",
              padding: "12mm",
              boxSizing: "border-box",
              fontFamily: '"Times New Roman", Times, serif',
              fontSize: "13px",
              color: "black",
            }}
          >
            <InvoiceLayout
              shopName={shopName}
              shopAddress={shopAddress}
              shopPhone={shopPhone}
              shopBank={shopBank}
              orderDate={order.created_at}
              customerName={customer?.name ?? order.partner_name ?? ""}
              customerCompany={""}
              customerPhone={customer?.phone ?? ""}
              customerAddress={customer?.address ?? ""}
              items={items}
              orderTotal={order.total}
              orderPaid={order.paid}
              oldDebt={oldDebt}
              currentDebt={currentDebt}
              invoiceNote={invoiceNote}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button variant="secondary" onClick={exportPdf} disabled={busy}>
            <FileText className="w-4 h-4" />
            {exporting === "pdf" ? "Đang xuất..." : "Xuất PDF"}
          </Button>
          <Button onClick={handlePrint} disabled={busy}>
            <Printer className="w-4 h-4" />
            {exporting === "print" ? "Đang mở..." : "In"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
