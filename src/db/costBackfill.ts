import { invoke } from "@tauri-apps/api/core";
import { getDb } from "./client";
import { getAllSettings, setSetting } from "./settings";
import { recomputeAllProductCosts } from "./products";

/**
 * Tăng số version này mỗi khi THUẬT TOÁN giá vốn đổi, để bản mới phát lại cho
 * cả máy đã chạy backfill cũ. v1 (v0.1.42) bị lỗi: bán khi tồn <= 0 rút giá
 * đặt tay khỏi bể → bể âm, giá vốn kẹp về 0. v2 sửa bằng quy tắc hàng thực có.
 * v3 (v0.1.44): chuyển sang chốt giá vốn lúc bán (giống KiotViet), bể rút theo
 * giá đã chốt - chỉ tính lại bể, không đụng giá đã chốt trên phiếu.
 * v4 (v0.1.45): hồi tố - ghi lại giá vốn cho mọi đơn bán/trả theo bình quân
 * tại thời điểm từng đơn (sửa luôn các đơn chốt sai từ v0.1.42/43).
 * v5 (v0.1.46): sửa 3 lỗi làm lãi mọi tháng sai trên data thật - số dư float
 * của đơn vị quy đổi làm giá vốn nổ; fallback tự nuôi từ price_cost; đơn bán
 * trước phiếu nhập đầu dùng giá rác thay vì giá lô nhập đầu.
 * v6 (v0.1.47): quay về chốt giá vốn lúc bán, không hồi tố (KiotViet). Giá vốn
 * đã có trên phiếu bán GIỮ NGUYÊN (kết quả v5 đã đúng), chỉ tính lại bể.
 */
const KEY = "cost_backfill_v6";
/** Tên file ghim - không khớp mẫu ke_toan_<số>.db nên Rust không xoay vòng. */
const PINNED_BACKUP = "ke_toan_truoc_gia_von_v6.db";

/**
 * Chạy 1 lần sau khi nâng cấp lên giá vốn bình quân gia quyền:
 *  1. Ghim 1 bản sao lưu DB (VACUUM INTO, gồm cả WAL) vào thư mục backups,
 *     tên riêng để không bị xoay vòng 7 bản - đường lùi vĩnh viễn.
 *  2. Phát lại giá vốn mọi SP, ghi nhật ký trước/sau vào cost_backfill_log.
 *  3. Đánh dấu vào app_settings để không chạy lại.
 * Làm tuần tự trong 1 luồng nên không có race với auto-backup bên Rust.
 */
/**
 * Kiểm tra DB đã migrate tới version binary mang theo chưa. Nếu chưa → ném lỗi
 * để App hiện cảnh báo, không để app chạy với DB thiếu bảng/cột (xem lib.rs
 * latest_migration_version).
 */
export async function assertDbMigrated(): Promise<void> {
  const db = await getDb();
  const expected = await invoke<number>("latest_migration_version");
  const rows = await db.select<{ v: number | null }[]>(
    "SELECT MAX(version) AS v FROM _sqlx_migrations WHERE success = 1",
  );
  const actual = rows[0]?.v ?? 0;
  if (actual < expected) {
    throw new Error(
      `Cơ sở dữ liệu chưa được cập nhật cấu trúc (đang ở bản ${actual}, cần ${expected}). ` +
        `Thường do file dữ liệu được khôi phục từ máy khác. Hãy đóng app, mở lại; nếu vẫn lỗi, gửi log cho hỗ trợ.`,
    );
  }
}

export async function ensureCostBackfill(): Promise<void> {
  await assertDbMigrated();
  const settings = await getAllSettings();
  if (settings[KEY]) return;

  const dbPath = await invoke<string>("get_db_path");
  const sep = dbPath.includes("\\") ? "\\" : "/";
  const dir = dbPath.slice(0, dbPath.lastIndexOf(sep));
  const target = `${dir}${sep}backups${sep}${PINNED_BACKUP}`;
  await invoke("ensure_dir", { path: `${dir}${sep}backups` });
  await invoke("delete_file", { path: target });
  const db = await getDb();
  await db.execute(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  console.info(`[costBackfill] đã ghim backup: ${target}`);

  const r = await recomputeAllProductCosts("upgrade");
  await setSetting(KEY, new Date().toISOString());
  console.info(
    `[costBackfill] phát lại giá vốn ${r.total} SP, ${r.changed} SP thay đổi (run ${r.run_id})`,
  );
}
