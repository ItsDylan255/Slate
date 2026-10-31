use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_sql::{Migration, MigrationKind};

// Datenbank-Migrationen. Neue Tabellen/Spalten immer als NEUE Migration
// mit höherer Version anhängen – bestehende nie nachträglich ändern.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: r#"
            CREATE TABLE projects (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                color       TEXT    NOT NULL DEFAULT '#6366f1',
                position    INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE columns (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name        TEXT    NOT NULL,
                position    INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE tasks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                column_id   INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
                title       TEXT    NOT NULL,
                description TEXT    NOT NULL DEFAULT '',
                priority    TEXT    NOT NULL DEFAULT 'none',
                due_date    TEXT,
                position    INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX idx_tasks_column ON tasks(column_id);
        "#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "sync_ready_schema",
            sql: include_str!("../migrations/002_sync_ready_schema.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

// ---------- Datei-Befehle für Sync, Anhänge und Export ----------
// Laufen in Rust, damit die Oberfläche beliebige Ordner (z. B. Google Drive) nutzen kann.

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Sucht einen Google-Drive-Ordner ("Meine Ablage" / "My Drive") auf allen Laufwerken.
#[tauri::command]
fn find_google_drive() -> Option<String> {
    for letter in b'D'..=b'Z' {
        for name in ["Meine Ablage", "My Drive"] {
            let p = PathBuf::from(format!("{}:\\{}", letter as char, name));
            if p.is_dir() {
                return Some(p.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[tauri::command]
fn app_data_path(app: tauri::AppHandle) -> CmdResult<String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
fn read_text_file(path: String) -> CmdResult<String> {
    fs::read_to_string(path).map_err(err)
}

/// Schreibt erst in eine temporäre Datei und benennt dann um, damit Google Drive nie halbe Dateien sieht.
#[tauri::command]
fn write_text_file(path: String, content: String) -> CmdResult<()> {
    let path = Path::new(&path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, content).map_err(err)?;
    fs::rename(&tmp, path).map_err(err)
}

/// Liest alle .json-Dateien eines Ordners: [(Dateiname, Inhalt)].
#[tauri::command]
fn read_json_files(dir: String) -> CmdResult<Vec<(String, String)>> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(out);
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().is_some_and(|e| e == "json") {
            if let Ok(content) = fs::read_to_string(&p) {
                out.push((entry.file_name().to_string_lossy().into_owned(), content));
            }
        }
    }
    Ok(out)
}

#[tauri::command]
fn list_files(dir: String) -> Vec<String> {
    fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .filter(|e| e.path().is_file())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default()
}

/// Kopiert eine Datei. Existiert das Ziel schon, passiert nichts. Gibt die Dateigröße zurück.
#[tauri::command]
fn copy_file(src: String, dst: String) -> CmdResult<u64> {
    let dst = Path::new(&dst);
    if let Some(parent) = dst.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    if !dst.exists() {
        fs::copy(&src, dst).map_err(err)?;
    }
    Ok(fs::metadata(dst).map_err(err)?.len())
}

#[tauri::command]
fn delete_file(path: String) {
    let _ = fs::remove_file(path);
}

#[tauri::command]
fn file_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn read_file_base64(path: String) -> CmdResult<String> {
    let bytes = fs::read(path).map_err(err)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn open_path(app: tauri::AppHandle, path: String) -> CmdResult<()> {
    app.opener().open_path(path, None::<&str>).map_err(err)
}

#[tauri::command]
fn reveal_path(app: tauri::AppHandle, path: String) -> CmdResult<()> {
    app.opener().reveal_item_in_dir(path).map_err(err)
}

/// Legt eine beschädigte Datenbank beiseite (Ordner "defekt-<Zeit>"), damit die App neu starten kann.
#[tauri::command]
fn quarantine_database(app: tauri::AppHandle) -> CmdResult<String> {
    let dir = app.path().app_data_dir().map_err(err)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let target = dir.join(format!("defekt-{stamp}"));
    fs::create_dir_all(&target).map_err(err)?;
    for name in ["projekt-manager.db", "projekt-manager.db-wal", "projekt-manager.db-shm"] {
        let src = dir.join(name);
        if src.exists() {
            fs::rename(&src, target.join(name)).map_err(err)?;
        }
    }
    Ok(target.to_string_lossy().into_owned())
}

// ---------- Google-Anmeldung und HTTP (für die Google-Kalender-Verbindung) ----------

/// Öffnet die Google-Anmeldung im Browser und wartet auf die Rückleitung an http://127.0.0.1:<port>.
/// Gibt (code, redirect_uri) zurück. auth_url ist die fertige Anmelde-URL ohne redirect_uri.
#[tauri::command]
async fn oauth_loopback(app: tauri::AppHandle, auth_url: String) -> CmdResult<(String, String)> {
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    let listener = TcpListener::bind("127.0.0.1:0").map_err(err)?;
    let port = listener.local_addr().map_err(err)?.port();
    let redirect = format!("http://127.0.0.1:{port}");
    let url = format!("{auth_url}&redirect_uri={}", urlencoding::encode(&redirect));
    app.opener().open_url(url, None::<&str>).map_err(err)?;

    let redirect_clone = redirect.clone();
    tauri::async_runtime::spawn_blocking(move || -> CmdResult<(String, String)> {
        // Höchstens 5 Minuten warten
        listener.set_nonblocking(false).map_err(err)?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        loop {
            if std::time::Instant::now() > deadline {
                return Err("Zeitüberschreitung bei der Google-Anmeldung".into());
            }
            let (mut stream, _) = listener.accept().map_err(err)?;
            let mut line = String::new();
            BufReader::new(&stream).read_line(&mut line).map_err(err)?;
            // "GET /?code=...&scope=... HTTP/1.1"
            let path = line.split_whitespace().nth(1).unwrap_or("");
            let query = path.split('?').nth(1).unwrap_or("");
            let param = |key: &str| {
                query.split('&').find_map(|kv| {
                    let (k, v) = kv.split_once('=')?;
                    (k == key).then(|| urlencoding::decode(v).map(|s| s.into_owned()).unwrap_or_default())
                })
            };
            let (title, ok) = match (param("code"), param("error")) {
                (Some(code), _) => (("Slate ist jetzt mit Google verbunden.", true), Some(code)),
                (_, Some(e)) => (("Anmeldung abgebrochen.", false), Some(format!("ERROR:{e}"))),
                _ => continue, // z. B. favicon-Anfrage
            };
            let body = format!(
                "<html><head><meta charset='utf-8'><title>Slate</title></head><body style='font-family:system-ui;background:#141414;color:#f5f5f5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0'><div style='text-align:center'><h2>{}</h2><p style='color:#a3a3a3'>Du kannst dieses Fenster schließen und zu Slate zurückkehren.</p></div></body></html>",
                title.0
            );
            let _ = write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let value = ok.unwrap_or_default();
            if !title.1 {
                return Err(value);
            }
            return Ok((value, redirect_clone));
        }
    })
    .await
    .map_err(err)?
}

/// Einfache HTTP-Anfrage (Google-API). Gibt (Statuscode, Antworttext) zurück.
#[tauri::command]
async fn http_request(
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
) -> CmdResult<(u16, String)> {
    let client = reqwest::Client::new();
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(err)?;
    let mut req = client.request(method, url);
    for (k, v) in headers {
        req = req.header(k, v);
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let res = req.send().await.map_err(err)?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(err)?;
    Ok((status, text))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Nur eine Slate-Instanz: ein zweiter Start holt das vorhandene Fenster nach vorne,
        // statt die Datenbank ein zweites Mal zu öffnen.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:projekt-manager.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            find_google_drive,
            app_data_path,
            read_text_file,
            write_text_file,
            read_json_files,
            list_files,
            copy_file,
            delete_file,
            file_exists,
            read_file_base64,
            open_path,
            reveal_path,
            quarantine_database,
            oauth_loopback,
            http_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
