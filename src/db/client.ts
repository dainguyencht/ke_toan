import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:ke_toan.db";

let _loading: Promise<Database> | null = null;

/**
 * Singleton kết nối DB, single-flight: cache PROMISE chứ không chỉ kết quả.
 * Lúc app mount, hàng chục hook gọi getDb() cùng lúc; nếu chỉ cache kết quả thì
 * tất cả đều chạy Database.load song song → plugin mở nhiều pool, migration
 * chạy trên pool đầu trong khi pool khác đã truy vấn (race "table
 * _sqlx_migrations already exists"), và lỗi migration của lần load đầu bị các
 * lần load sau che mất. Giờ chỉ có đúng 1 lần load; lỗi thì mọi caller cùng
 * thấy, và lần gọi sau được thử lại.
 */
export function getDb(): Promise<Database> {
  if (!_loading) {
    _loading = Database.load(DB_URL).catch((err) => {
      _loading = null; // cho phép thử lại
      throw err;
    });
  }
  return _loading;
}
