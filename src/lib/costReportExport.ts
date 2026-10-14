import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import ExcelJS from "exceljs";
import { getDb } from "@/db/client";
import { toISODate } from "./utils";

export type ExportResult =
  | { ok: true; path: string }
  | { ok: false; reason: "cancelled" | "no-run" }
  | { ok: false; reason: "error"; message: string };

const MONEY = "#,##0;[Red]-#,##0";
const PCT = "0.0%";

/**
 * Xuất Excel "Báo cáo thay đổi giá vốn" cho lần tính lại gần nhất:
 *   - Tổng quan: lần chạy, số SP/dòng đổi, tổng giá trị tồn
 *   - Lãi theo tháng: doanh thu, lãi trước / sau khi tính lại, chênh, biên
 *   - Giá vốn SP: từng SP đổi giá vốn, giá cũ/mới, tồn, chênh giá trị tồn
 *   - SP gây chênh lãi: theo tháng, SP nào làm lãi đổi nhiều nhất
 * "Trước" = giá vốn cũ ghi trong cost_backfill_log / cost_backfill_item_log.
 */
export async function exportCostChangeReport(): Promise<ExportResult> {
  try {
    const db = await getDb();
    const runs = await db.select<{ run_id: string; reason: string; at: string; n: number }[]>(
      `SELECT run_id, reason, MIN(created_at) AS at, COUNT(*) AS n
       FROM cost_backfill_log GROUP BY run_id ORDER BY MAX(id) DESC LIMIT 1`,
    );
    const run = runs[0];
    if (!run) return { ok: false, reason: "no-run" };

    const products = await db.select<
      { sku: string; name: string; unit: string; old_cost: number; new_cost: number;
        old_value: number; new_value: number; stock: number }[]
    >(
      `SELECT p.sku, p.name, p.unit, l.old_price_cost AS old_cost, l.new_price_cost AS new_cost,
              l.old_stock_value AS old_value, l.new_stock_value AS new_value,
              COALESCE((SELECT SUM(v.stock_qty) FROM product_variants v WHERE v.product_id=p.id),0) AS stock
       FROM cost_backfill_log l JOIN products p ON p.id = l.product_id
       WHERE l.run_id = ? ORDER BY ABS(l.new_stock_value - l.old_stock_value) DESC`,
      [run.run_id],
    );

    // Lãi theo tháng: "trước" dùng old_cost của dòng nếu dòng có trong item log,
    // không thì dòng không đổi → old = new.
    const months = await db.select<
      { thang: string; doanh_thu: number; gia_von_truoc: number; gia_von_sau: number }[]
    >(
      `SELECT strftime('%Y-%m', o.created_at) AS thang,
              SUM(i.total * (CAST(o.total AS REAL) / NULLIF(o.subtotal, 0))) AS doanh_thu,
              SUM(i.qty * COALESCE(il.old_cost, i.cost)) AS gia_von_truoc,
              SUM(i.qty * i.cost) AS gia_von_sau
       FROM order_items i
       JOIN orders o ON o.id = i.order_id
       LEFT JOIN cost_backfill_item_log il ON il.order_item_id = i.id AND il.run_id = ?
       WHERE o.type = 'sale' AND o.status != 'cancelled'
       GROUP BY 1 ORDER BY 1`,
      [run.run_id],
    );

    const drivers = await db.select<
      { thang: string; sku: string; name: string; chenh: number; sl: number; gv_cu: number; gv_moi: number }[]
    >(
      `SELECT * FROM (
         SELECT strftime('%Y-%m', o.created_at) AS thang, p.sku, p.name,
                SUM(i.qty * (il.old_cost - il.new_cost)) AS chenh, SUM(i.qty) AS sl,
                AVG(il.old_cost / COALESCE(i.unit_factor,1)) AS gv_cu,
                AVG(il.new_cost / COALESCE(i.unit_factor,1)) AS gv_moi,
                ROW_NUMBER() OVER (PARTITION BY strftime('%Y-%m', o.created_at)
                                   ORDER BY ABS(SUM(i.qty * (il.old_cost - il.new_cost))) DESC) AS rn
         FROM cost_backfill_item_log il
         JOIN order_items i ON i.id = il.order_item_id
         JOIN orders o ON o.id = i.order_id
         JOIN product_variants v ON v.id = i.variant_id
         JOIN products p ON p.id = v.product_id
         WHERE il.run_id = ? AND o.type = 'sale' AND o.status != 'cancelled'
         GROUP BY 1, p.id
       ) WHERE rn <= 5 ORDER BY thang, rn`,
      [run.run_id],
    );
    const itemCount = await db.select<{ n: number }[]>(
      "SELECT COUNT(*) AS n FROM cost_backfill_item_log WHERE run_id = ?",
      [run.run_id],
    );
    const totalValue = await db.select<{ v: number }[]>(
      `SELECT COALESCE(SUM(MAX(p.stock_value,0)),0) AS v FROM products p
       WHERE p.is_archived = 0 AND COALESCE((SELECT SUM(v.stock_qty) FROM product_variants v
         WHERE v.product_id = p.id),0) > 0`,
    );

    const wb = new ExcelJS.Workbook();
    const head = (ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number; fmt?: string }[]) => {
      ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
      cols.forEach((c, i) => { if (c.fmt) ws.getColumn(i + 1).numFmt = c.fmt; });
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };

    // 1. Tổng quan
    const s1 = wb.addWorksheet("Tổng quan");
    s1.columns = [{ width: 36 }, { width: 28 }];
    const changedProducts = products.filter((p) => Math.abs(p.old_cost - p.new_cost) > 0.5).length;
    const rows1: [string, string | number][] = [
      ["Lần tính lại", run.run_id],
      ["Thời điểm", run.at],
      ["Lý do", run.reason === "upgrade" ? "Tự động sau nâng cấp" : "Bấm tay ở Cài đặt"],
      ["Sản phẩm đổi giá vốn", changedProducts],
      ["Sản phẩm đổi giá trị tồn", products.length],
      ["Dòng phiếu đổi giá vốn", itemCount[0]?.n ?? 0],
      ["Tổng giá trị tồn kho hiện tại", totalValue[0]?.v ?? 0],
      ["Tổng lãi gộp trước", months.reduce((s, m) => s + m.doanh_thu - m.gia_von_truoc, 0)],
      ["Tổng lãi gộp sau", months.reduce((s, m) => s + m.doanh_thu - m.gia_von_sau, 0)],
    ];
    rows1.forEach(([k, v]) => {
      const r = s1.addRow([k, v]);
      r.getCell(1).font = { bold: true };
      if (typeof v === "number" && v > 1000) r.getCell(2).numFmt = MONEY;
    });
    s1.addRow([]);
    s1.addRow(["Ghi chú", "Trước = giá vốn ngay trước lần tính lại này. Sau = giá vốn hiện tại. Số phiếu, số lượng, giá bán, tồn kho, sổ quỹ, công nợ không đổi."]).getCell(2).alignment = { wrapText: true };

    // 2. Lãi theo tháng
    const s2 = wb.addWorksheet("Lãi theo tháng");
    head(s2, [
      { header: "Tháng", key: "thang", width: 10 },
      { header: "Doanh thu", key: "dt", width: 16, fmt: MONEY },
      { header: "Giá vốn trước", key: "gvt", width: 16, fmt: MONEY },
      { header: "Giá vốn sau", key: "gvs", width: 16, fmt: MONEY },
      { header: "Lãi gộp trước", key: "lt", width: 16, fmt: MONEY },
      { header: "Lãi gộp sau", key: "ls", width: 16, fmt: MONEY },
      { header: "Chênh", key: "ch", width: 14, fmt: MONEY },
      { header: "Biên sau", key: "bien", width: 10, fmt: PCT },
    ]);
    for (const m of months) {
      const lt = m.doanh_thu - m.gia_von_truoc, ls = m.doanh_thu - m.gia_von_sau;
      s2.addRow({ thang: m.thang, dt: m.doanh_thu, gvt: m.gia_von_truoc, gvs: m.gia_von_sau,
        lt, ls, ch: ls - lt, bien: m.doanh_thu > 0 ? ls / m.doanh_thu : 0 });
    }
    const tot = months.reduce((a, m) => ({ dt: a.dt + m.doanh_thu, gvt: a.gvt + m.gia_von_truoc, gvs: a.gvs + m.gia_von_sau }), { dt: 0, gvt: 0, gvs: 0 });
    const tr = s2.addRow({ thang: "Tổng", dt: tot.dt, gvt: tot.gvt, gvs: tot.gvs, lt: tot.dt - tot.gvt, ls: tot.dt - tot.gvs,
      ch: tot.gvt - tot.gvs, bien: tot.dt > 0 ? (tot.dt - tot.gvs) / tot.dt : 0 });
    tr.font = { bold: true };

    // 3. Giá vốn SP
    const s3 = wb.addWorksheet("Giá vốn SP");
    head(s3, [
      { header: "Mã SP", key: "sku", width: 14 },
      { header: "Tên", key: "name", width: 30 },
      { header: "ĐV", key: "unit", width: 7 },
      { header: "Giá vốn trước", key: "oc", width: 16, fmt: MONEY },
      { header: "Giá vốn sau", key: "nc", width: 16, fmt: MONEY },
      { header: "Tồn", key: "stock", width: 10, fmt: "#,##0.##" },
      { header: "Giá trị tồn trước", key: "ov", width: 18, fmt: MONEY },
      { header: "Giá trị tồn sau", key: "nv", width: 18, fmt: MONEY },
      { header: "Chênh giá trị", key: "dv", width: 16, fmt: MONEY },
    ]);
    for (const p of products) {
      s3.addRow({ sku: p.sku, name: p.name, unit: p.unit, oc: p.old_cost, nc: p.new_cost,
        stock: p.stock, ov: p.old_value, nv: p.new_value, dv: p.new_value - p.old_value });
    }

    // 4. SP gây chênh lãi
    const s4 = wb.addWorksheet("SP gây chênh lãi");
    head(s4, [
      { header: "Tháng", key: "thang", width: 10 },
      { header: "Mã SP", key: "sku", width: 14 },
      { header: "Tên", key: "name", width: 30 },
      { header: "Chênh lãi (+ tăng)", key: "chenh", width: 18, fmt: MONEY },
      { header: "SL bán", key: "sl", width: 10, fmt: "#,##0.##" },
      { header: "Giá vốn cũ (đv gốc)", key: "gvc", width: 18, fmt: MONEY },
      { header: "Giá vốn mới (đv gốc)", key: "gvm", width: 18, fmt: MONEY },
    ]);
    for (const d of drivers) {
      s4.addRow({ thang: d.thang, sku: d.sku, name: d.name, chenh: d.chenh, sl: d.sl, gvc: d.gv_cu, gvm: d.gv_moi });
    }

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const target = await save({
      title: "Xuất báo cáo thay đổi giá vốn",
      defaultPath: `BaoCaoGiaVon_${toISODate(new Date())}.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!target) return { ok: false, reason: "cancelled" };
    await invoke("save_bytes", { path: target, bytes: Array.from(new Uint8Array(buf)) });
    try { await invoke("open_path_in_os", { path: target }); } catch { /* đã ghi xong */ }
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, reason: "error", message: (err as Error).message };
  }
}
