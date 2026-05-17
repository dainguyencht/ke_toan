import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, Download, Upload, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  downloadTemplate,
  importRows,
  parseProductFile,
  validateAgainstDb,
  type ImportResult,
  type ImportRow,
} from "@/lib/productImport";
import { cn, formatVND } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function ImportProductsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows(null);
    setFileName("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setResult(null);
    try {
      const parsed = await parseProductFile(file);
      if (parsed.length === 0) {
        toast.error("File không có dữ liệu");
        setRows([]);
        return;
      }
      const validated = await validateAgainstDb(parsed);
      setRows(validated);
    } catch (err) {
      toast.error((err as Error).message);
      setRows(null);
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!rows) return;
    setImporting(true);
    try {
      const res = await importRows(rows);
      setResult(res);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success(`Đã thêm ${res.created} sản phẩm`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows?.filter((r) => r.errors.length === 0).length ?? 0;
  const errorCount = (rows?.length ?? 0) - validCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nhập sản phẩm từ Excel</DialogTitle>
        </DialogHeader>

        {result ? (
          // ===== KẾT QUẢ =====
          <ResultPanel result={result} onDone={() => handleClose(false)} />
        ) : !rows ? (
          // ===== CHỌN FILE =====
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">
              Chọn file Excel (.xlsx) hoặc CSV chứa danh sách sản phẩm. Cần có 2
              cột bắt buộc: <strong>SKU</strong> và <strong>Tên sản phẩm</strong>.
              Các cột khác tùy chọn.
            </p>

            <div className="border-2 border-dashed border-neutral-300 rounded-lg p-8 text-center bg-neutral-50">
              <FileSpreadsheet className="w-10 h-10 mx-auto text-neutral-400" />
              <p className="mt-2 text-sm text-neutral-600">
                {parsing ? "Đang đọc file..." : "Chọn file để bắt đầu"}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="hidden"
                id="import-file-input"
              />
              <label htmlFor="import-file-input">
                <Button asChild className="mt-3" disabled={parsing}>
                  <span>
                    <Upload className="w-4 h-4" />
                    Chọn file...
                  </span>
                </Button>
              </label>
            </div>

            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <span>Chưa có file mẫu?</span>
              <Button variant="link" onClick={downloadTemplate} className="h-auto px-1">
                <Download className="w-4 h-4" />
                Tải template
              </Button>
            </div>
          </div>
        ) : (
          // ===== PREVIEW =====
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">
                File: <strong>{fileName}</strong> · {rows.length} dòng
              </span>
              <Button variant="link" onClick={reset} className="h-auto">
                Chọn file khác
              </Button>
            </div>

            <div className="flex gap-2">
              <Stat
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Hợp lệ"
                value={validCount}
                tone="green"
              />
              <Stat
                icon={<AlertCircle className="w-4 h-4" />}
                label="Có lỗi (sẽ bỏ qua)"
                value={errorCount}
                tone={errorCount > 0 ? "amber" : "neutral"}
              />
            </div>

            <div className="border border-neutral-200 rounded-md max-h-96 overflow-auto">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-12">#</TH>
                    <TH>SKU</TH>
                    <TH>Tên</TH>
                    <TH className="text-right">Giá bán</TH>
                    <TH className="text-right">Tồn</TH>
                    <TH>Trạng thái</TH>
                  </TR>
                </THead>
                <TBody>
                  {rows.slice(0, 100).map((r) => (
                    <TR key={r.rowNum}>
                      <TD className="text-neutral-400 text-xs">{r.rowNum}</TD>
                      <TD className="font-mono text-xs">{r.sku || "-"}</TD>
                      <TD>{r.name || "-"}</TD>
                      <TD className="text-right tabular-nums">
                        {formatVND(r.price_sell)}
                      </TD>
                      <TD className="text-right tabular-nums">{r.initial_stock}</TD>
                      <TD>
                        {r.errors.length === 0 ? (
                          <span className="text-green-600 inline-flex items-center gap-1 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            OK
                          </span>
                        ) : (
                          <span className="text-amber-700 text-xs">
                            {r.errors.join("; ")}
                          </span>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {rows.length > 100 && (
                <div className="p-2 text-center text-xs text-neutral-500 border-t">
                  ... và {rows.length - 100} dòng nữa
                </div>
              )}
            </div>
          </div>
        )}

        {!result && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Hủy
            </Button>
            {rows && (
              <Button
                onClick={handleImport}
                disabled={importing || validCount === 0}
              >
                {importing ? "Đang nhập..." : `Nhập ${validCount} sản phẩm`}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "green" | "amber" | "neutral";
}) {
  const toneClass = {
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    neutral: "bg-neutral-50 text-neutral-600 border-neutral-200",
  }[tone];
  return (
    <div
      className={cn("flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm", toneClass)}
    >
      {icon}
      <span>
        {label}: <strong className="tabular-nums">{value}</strong>
      </span>
    </div>
  );
}

function ResultPanel({
  result,
  onDone,
}: {
  result: ImportResult;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center py-6">
        <CheckCircle2 className="w-12 h-12 mx-auto text-green-500" />
        <h3 className="text-lg font-semibold mt-2">Hoàn tất</h3>
        <p className="text-neutral-600 mt-1">
          Đã thêm <strong>{result.created}</strong> sản phẩm vào kho.
        </p>
      </div>

      {result.errors.length > 0 && (
        <div className="border border-amber-200 rounded-md bg-amber-50 p-3">
          <div className="text-sm font-medium text-amber-800 mb-2">
            {result.errors.length} dòng bị lỗi khi insert:
          </div>
          <ul className="text-xs text-amber-700 space-y-1 max-h-40 overflow-auto">
            {result.errors.map((e, i) => (
              <li key={i}>
                Dòng {e.rowNum} ({e.sku}): {e.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <DialogFooter>
        <Button onClick={onDone}>Đóng</Button>
      </DialogFooter>
    </div>
  );
}
