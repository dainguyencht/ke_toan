import { getAllSettings, setSetting } from "./settings";
import { recomputeAllProductCosts } from "./products";

const KEY = "cost_backfill_v1";

/**
 * Chạy 1 lần sau khi nâng cấp lên giá vốn bình quân gia quyền: phát lại lịch
 * sử kho cho mọi SP để products.stock_value / price_cost đúng với dữ liệu cũ
 * (migration 012 chỉ backfill = tồn × giá vốn cũ, chưa phân bổ chiết khấu).
 * Đánh dấu vào app_settings để không chạy lại mỗi lần mở app.
 */
export async function ensureCostBackfill(): Promise<void> {
  const settings = await getAllSettings();
  if (settings[KEY]) return;
  const n = await recomputeAllProductCosts();
  await setSetting(KEY, new Date().toISOString());
  console.info(`[costBackfill] đã phát lại giá vốn cho ${n} sản phẩm`);
}
