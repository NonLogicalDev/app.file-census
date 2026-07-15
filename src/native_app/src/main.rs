use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::Context;
use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

use file_census_backend::{app::AppCore, paths};

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            rpc,
            database_info,
            database_choose,
            folder_choose
        ])
        .setup(|app| {
            let db_path = initial_db_path(app)?;
            let config_path = db_config_path(app)?;
            let state = DesktopState::open(db_path, config_path)?;
            let mut events = state.core()?.subscribe();
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                while let Ok(event) = events.recv().await {
                    let _ = app_handle.emit("app-event", event);
                }
            });

            app.manage(Mutex::new(state));

            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("file-census")
                    .inner_size(1280.0, 900.0)
                    .min_inner_size(980.0, 680.0)
                    .build()?;
            let _ = window.show();
            let _ = window.set_focus();

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running file-census desktop app");
}

#[tauri::command]
async fn rpc(
    state: State<'_, Mutex<DesktopState>>,
    method: String,
    params: Option<Value>,
) -> Result<Value, String> {
    let core = state
        .lock()
        .map_err(|_| "desktop state lock poisoned".to_string())?
        .core()?;
    core.handle(&method, params)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn database_info(state: State<'_, Mutex<DesktopState>>) -> Result<DatabaseInfo, String> {
    state
        .lock()
        .map_err(|_| "desktop state lock poisoned".to_string())?
        .info()
}

#[tauri::command]
fn database_choose(
    app: tauri::AppHandle,
    state: State<'_, Mutex<DesktopState>>,
) -> Result<Option<DatabaseInfo>, String> {
    let current_path = state
        .lock()
        .map_err(|_| "desktop state lock poisoned".to_string())?
        .db_path
        .clone();
    let selected = rfd::FileDialog::new()
        .set_title("Choose file-census database")
        .set_file_name(
            current_path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("file-census.db"),
        )
        .add_filter("SQLite database", &["db", "sqlite", "sqlite3"])
        .save_file();

    let Some(path) = selected else {
        return Ok(None);
    };

    let mut state = state
        .lock()
        .map_err(|_| "desktop state lock poisoned".to_string())?;
    state.switch_to(path)?;
    let mut events = state.core()?.subscribe();
    let app_for_events = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Ok(event) = events.recv().await {
            let _ = app_for_events.emit("app-event", event);
        }
    });
    let info = state.info()?;
    let _ = app.emit(
        "app-event",
        file_census_backend::events::AppEvent {
            kind: "database_changed".to_string(),
            payload: serde_json::to_value(&info).unwrap_or(Value::Null),
        },
    );
    Ok(Some(info))
}

#[tauri::command]
fn folder_choose(current_path: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new().set_title("Choose location folder");
    if let Some(path) = current_path.filter(|path| !path.trim().is_empty()) {
        let path = PathBuf::from(path);
        if path.exists() {
            dialog = dialog.set_directory(path);
        }
    }
    Ok(dialog
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

struct DesktopState {
    core: AppCore,
    db_path: PathBuf,
    config_path: PathBuf,
    event_poll_task: Option<tauri::async_runtime::JoinHandle<()>>,
}

impl DesktopState {
    fn open(db_path: PathBuf, config_path: PathBuf) -> anyhow::Result<Self> {
        let core = AppCore::open(db_path.clone())?;
        let event_poll_task = Some(tauri::async_runtime::spawn(
            core.clone().poll_event_journal(),
        ));
        Ok(Self {
            core,
            db_path,
            config_path,
            event_poll_task,
        })
    }

    fn core(&self) -> Result<AppCore, String> {
        Ok(self.core.clone())
    }

    fn info(&self) -> Result<DatabaseInfo, String> {
        Ok(DatabaseInfo {
            path: self.db_path.to_string_lossy().to_string(),
        })
    }

    fn switch_to(&mut self, db_path: PathBuf) -> Result<(), String> {
        if let Some(task) = self.event_poll_task.take() {
            task.abort();
        }
        let core = AppCore::open(db_path.clone()).map_err(|error| error.to_string())?;
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        std::fs::write(&self.config_path, db_path.to_string_lossy().as_bytes())
            .map_err(|error| error.to_string())?;
        self.event_poll_task = Some(tauri::async_runtime::spawn(
            core.clone().poll_event_journal(),
        ));
        self.core = core;
        self.db_path = db_path;
        Ok(())
    }
}

#[derive(Serialize)]
struct DatabaseInfo {
    path: String,
}

fn initial_db_path(app: &tauri::App) -> anyhow::Result<PathBuf> {
    if let Some(path) = std::env::var_os("FILE_CENSUS_DB") {
        return Ok(PathBuf::from(path));
    }

    let config_path = db_config_path(app)?;
    if let Ok(path) = std::fs::read_to_string(&config_path) {
        let path = path.trim();
        if !path.is_empty() {
            return Ok(PathBuf::from(path));
        }
    }

    let default_path = paths::default_db_path()?;
    let legacy_path = app
        .path()
        .app_data_dir()
        .context("resolving legacy app data directory")?
        .join("file-census.db");

    if !default_path.exists() && legacy_path.exists() {
        return Ok(legacy_path);
    }

    Ok(default_path)
}

fn db_config_path(app: &tauri::App) -> anyhow::Result<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("resolving app config directory")?;
    Ok(config_dir.join("database-path"))
}
