use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tauri_plugin_sql::{Migration, MigrationKind};

const DB_FILENAME: &str = "ke_toan.db";
const BACKUP_DIR: &str = "backups";
const KEEP_BACKUPS: usize = 7;

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join(DB_FILENAME))
}

#[tauri::command]
fn get_db_path(app: AppHandle) -> Result<String, String> {
    Ok(db_path(&app)?.to_string_lossy().to_string())
}

/// Đường dẫn file phụ của SQLite: <db>-wal, <db>-shm.
fn sidecar(p: &Path, suffix: &str) -> PathBuf {
    let mut s = p.as_os_str().to_os_string();
    s.push(suffix);
    PathBuf::from(s)
}

/// Copy DB KÈM file -wal/-shm.
///
/// DB chạy chế độ WAL: phần lớn thay đổi gần nhất nằm trong <db>-wal và chỉ được
/// gộp vào file .db khi checkpoint. Copy mỗi .db sẽ mất toàn bộ phần chưa
/// checkpoint - bản sao lưu trông vẫn mở được nhưng thiếu dữ liệu mới nhất.
/// Nếu nguồn không có -wal thì phải XOÁ -wal cũ ở đích, nếu không lần mở sau
/// SQLite sẽ replay WAL cũ chồng lên DB vừa ghi đè.
fn copy_db_with_wal(src: &Path, dst: &Path) -> Result<(), String> {
    fs::copy(src, dst).map_err(|e| format!("Copy lỗi: {e}"))?;
    for suffix in ["-wal", "-shm"] {
        let s = sidecar(src, suffix);
        let d = sidecar(dst, suffix);
        if s.exists() {
            fs::copy(&s, &d).map_err(|e| format!("Copy {suffix} lỗi: {e}"))?;
        } else if d.exists() {
            fs::remove_file(&d).map_err(|e| format!("Xoá {suffix} cũ lỗi: {e}"))?;
        }
    }
    Ok(())
}

/// Sao lưu bằng cách copy file, KÈM -wal/-shm. Dùng làm dự phòng khi
/// `VACUUM INTO` ở frontend lỗi. Tạo ra nhiều file cạnh nhau nên kém gọn hơn
/// VACUUM INTO, nhưng không mất dữ liệu.
#[tauri::command]
fn backup_db(app: AppHandle, target: String) -> Result<String, String> {
    let src = db_path(&app)?;
    let dst = PathBuf::from(&target);
    copy_db_with_wal(&src, &dst)?;
    Ok(target)
}

/// Xoá 1 file nếu có. Dùng trước `VACUUM INTO` vì lệnh này từ chối ghi đè.
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("Không xoá được file: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn restore_db(app: AppHandle, source: String) -> Result<(), String> {
    let dst = db_path(&app)?;
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err(format!("File không tồn tại: {source}"));
    }
    // Sao lưu DB hiện tại (kèm WAL) trước khi ghi đè
    let safety = dst.with_extension("db.before_restore");
    if dst.exists() {
        copy_db_with_wal(&dst, &safety).map_err(|e| format!("Sao lưu hiện tại lỗi: {e}"))?;
    }
    copy_db_with_wal(&src, &dst).map_err(|e| format!("Ghi đè lỗi: {e}"))?;
    Ok(())
}

#[tauri::command]
fn save_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    fs::write(PathBuf::from(&path), &bytes).map_err(|e| format!("Lỗi ghi file: {e}"))
}

#[tauri::command]
fn open_path_in_os(path: String) -> Result<(), String> {
    use std::process::Command;
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Không mở được file: {e}"))?;
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", &path])
            .spawn()
            .map_err(|e| format!("Không mở được file: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Không mở được file: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
fn list_auto_backups(app: AppHandle) -> Result<Vec<String>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let backup_dir = data_dir.join(BACKUP_DIR);
    if !backup_dir.exists() {
        return Ok(vec![]);
    }
    let mut entries: Vec<(String, u64)> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_name()?.to_string_lossy().to_string();
            if !name.ends_with(".db") {
                return None;
            }
            let modified = e.metadata().ok()?.modified().ok()?;
            let ts = modified.duration_since(UNIX_EPOCH).ok()?.as_secs();
            Some((path.to_string_lossy().to_string(), ts))
        })
        .collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(entries.into_iter().map(|(p, _)| p).collect())
}

/// Tạo bản auto-backup. Chạy trong setup khi app khởi động.
fn run_auto_backup(app: &AppHandle) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let src = data_dir.join(DB_FILENAME);
    if !src.exists() {
        // Chưa có DB (lần chạy đầu) -> bỏ qua
        return Ok(());
    }
    let backup_dir = data_dir.join(BACKUP_DIR);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs();
    let dst = backup_dir.join(format!("ke_toan_{ts}.db"));
    copy_db_with_wal(&src, &dst).map_err(|e| format!("auto-backup copy: {e}"))?;

    // Cắt bớt - chỉ giữ KEEP_BACKUPS bản mới nhất
    let mut entries: Vec<(PathBuf, u64)> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let p = e.path();
            let n = p.file_name()?.to_string_lossy().to_string();
            if !n.ends_with(".db") {
                return None;
            }
            let m = e.metadata().ok()?.modified().ok()?;
            let t = m.duration_since(UNIX_EPOCH).ok()?.as_secs();
            Some((p, t))
        })
        .collect();
    entries.sort_by(|a, b| b.1.cmp(&a.1));
    for (path, _) in entries.into_iter().skip(KEEP_BACKUPS) {
        let _ = fs::remove_file(&path);
        // Xoá kèm file phụ để không còn -wal/-shm mồ côi
        let _ = fs::remove_file(sidecar(&path, "-wal"));
        let _ = fs::remove_file(sidecar(&path, "-shm"));
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "init_schema",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "app_settings",
            sql: include_str!("../migrations/002_settings.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "product_units",
            sql: include_str!("../migrations/003_units.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "order_snapshot_debt",
            sql: include_str!("../migrations/004_order_snapshot_debt.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "sync_variant_sku",
            sql: include_str!("../migrations/005_sync_variant_sku.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "recompute_contact_debt",
            sql: include_str!("../migrations/006_recompute_contact_debt.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "backfill_order_paid",
            sql: include_str!("../migrations/007_backfill_order_paid.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "recompute_stock_qty",
            sql: include_str!("../migrations/008_recompute_stock_qty.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "debt_adjustments",
            sql: include_str!("../migrations/009_debt_adjustments.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "recompute_debts_with_adjustments",
            sql: include_str!("../migrations/010_recompute_debts.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "cash_method",
            sql: include_str!("../migrations/011_cash_method.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(&format!("sqlite:{DB_FILENAME}"), migrations)
                .build(),
        )
        .setup(|app| {
            let handle = app.handle().clone();
            // Chạy auto-backup trong thread riêng để không block UI
            std::thread::spawn(move || {
                if let Err(e) = run_auto_backup(&handle) {
                    eprintln!("auto-backup failed: {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            backup_db,
            delete_file,
            restore_db,
            list_auto_backups,
            save_bytes,
            open_path_in_os,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ke_toan_test_{name}"));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn copy_db_mang_theo_wal() {
        let d = tmp_dir("wal");
        let src = d.join("a.db");
        let dst = d.join("b.db");
        fs::write(&src, b"main").unwrap();
        fs::write(sidecar(&src, "-wal"), b"wal-moi").unwrap();
        fs::write(sidecar(&src, "-shm"), b"shm").unwrap();

        copy_db_with_wal(&src, &dst).unwrap();

        assert_eq!(fs::read(&dst).unwrap(), b"main");
        // Thiếu bước này là mất dữ liệu chưa checkpoint
        assert_eq!(fs::read(sidecar(&dst, "-wal")).unwrap(), b"wal-moi");
        assert!(sidecar(&dst, "-shm").exists());
    }

    #[test]
    fn nguon_khong_co_wal_thi_xoa_wal_cu_o_dich() {
        let d = tmp_dir("stale");
        let src = d.join("a.db");
        let dst = d.join("b.db");
        fs::write(&src, b"khoi-phuc").unwrap();
        fs::write(&dst, b"cu").unwrap();
        // WAL cũ của DB đang chạy: nếu giữ lại, SQLite sẽ replay đè lên bản khôi phục
        fs::write(sidecar(&dst, "-wal"), b"wal-cu").unwrap();
        fs::write(sidecar(&dst, "-shm"), b"shm-cu").unwrap();

        copy_db_with_wal(&src, &dst).unwrap();

        assert_eq!(fs::read(&dst).unwrap(), b"khoi-phuc");
        assert!(!sidecar(&dst, "-wal").exists());
        assert!(!sidecar(&dst, "-shm").exists());
    }
}
