//! Settings persistence.
//!
//! The backend stores the settings blob opaquely (the frontend owns its shape)
//! as plain JSON in the app config directory. Local-only, like recent files.

use std::fs;
use std::path::PathBuf;

use serde_json::Value;
use tauri::AppHandle;

use crate::paths;

fn store_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    Ok(paths::config_dir(app)?.join(name))
}

fn load_named(app: &AppHandle, name: &str) -> Result<Option<Value>, String> {
    let p = store_path(app, name)?;
    match fs::read(&p) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).ok()),
        Err(_) => Ok(None),
    }
}

fn save_named(app: &AppHandle, name: &str, value: &Value) -> Result<(), String> {
    let p = store_path(app, name)?;
    let json = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| format!("cannot write {name}: {e}"))
}

pub fn load(app: &AppHandle) -> Result<Option<Value>, String> {
    load_named(app, "settings.json")
}

pub fn save(app: &AppHandle, value: &Value) -> Result<(), String> {
    save_named(app, "settings.json", value)
}

pub fn session_load(app: &AppHandle) -> Result<Option<Value>, String> {
    load_named(app, "session.json")
}

pub fn session_save(app: &AppHandle, value: &Value) -> Result<(), String> {
    save_named(app, "session.json", value)
}
