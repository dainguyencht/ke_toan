use std::fs;
use std::path::PathBuf;
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

#[tauri::command]
fn backup_db(app: AppHandle, target: String) -> Result<String, String> {
    let src = db_path(&app)?;
    let dst = PathBuf::from(&target);
    fs::copy(&src, &dst).map_err(|e| format!("Copy lỗi: {e}"))?;
    Ok(target)
}

#[tauri::command]
fn restore_db(app: AppHandle, source: String) -> Result<(), String> {
    let dst = db_path(&app)?;
    let src = PathBuf::from(&source);
    if !src.exists() {
        return Err(format!("File không tồn tại: {source}"));
    }
    // Sao lưu DB hiện tại trước khi ghi đè
    let safety = dst.with_extension("db.before_restore");
    if dst.exists() {
        fs::copy(&dst, &safety).map_err(|e| format!("Sao lưu hiện tại lỗi: {e}"))?;
    }
    fs::copy(&src, &dst).map_err(|e| format!("Ghi đè lỗi: {e}"))?;
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
    fs::copy(&src, &dst).map_err(|e| format!("auto-backup copy: {e}"))?;

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
            restore_db,
            list_auto_backups,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
