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
 */
const KEY = "cost_backfill_v3";
/** Tên file ghim - không khớp mẫu ke_toan_<số>.db nên Rust không xoay vòng. */
const PINNED_BACKUP = "ke_toan_truoc_gia_von_v3.db";

/**
 * Chạy 1 lần sau khi nâng cấp lên giá vốn bình quân gia quyền:
 *  1. Ghim 1 bản sao lưu DB (VACUUM INTO, gồm cả WAL) vào thư mục backups,
 *     tên riêng để không bị xoay vòng 7 bản - đường lùi vĩnh viễn.
 *  2. Phát lại giá vốn mọi SP, ghi nhật ký trước/sau vào cost_backfill_log.
 *  3. Đánh dấu vào app_settings để không chạy lại.
 * Làm tuần tự trong 1 luồng nên không có race với auto-backup bên Rust.
 */
export async function ensureCostBackfill(): Promise<void> {
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
