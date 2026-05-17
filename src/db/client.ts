import Database from "@tauri-apps/plugin-sql";

const DB_URL = "sqlite:ke_toan.db";

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load(DB_URL);
  }
  return _db;
}
