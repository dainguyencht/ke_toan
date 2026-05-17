import { getDb } from "./client";

export type SettingsMap = Record<string, string>;

export async function getAllSettings(): Promise<SettingsMap> {
  const db = await getDb();
  const rows = await db.select<{ key: string; value: string | null }[]>(
    "SELECT key, value FROM app_settings",
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ""]));
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value],
  );
}

export async function setMultiple(updates: SettingsMap): Promise<void> {
  for (const [k, v] of Object.entries(updates)) {
    await setSetting(k, v);
  }
}
