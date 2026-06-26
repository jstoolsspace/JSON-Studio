//! Resolves where local data (settings, recent files, session) is stored.
//!
//! Portable mode: if a file named `portable.txt` sits next to the executable,
//! or a `JSONStudioData` folder already exists there, all data is kept in that
//! folder beside the app instead of the OS config directory. This makes the app
//! runnable from a USB stick without writing to the user profile or registry.
//! Otherwise it falls back to the normal per-user app config directory.

use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const PORTABLE_MARKER: &str = "portable.txt";
const PORTABLE_DIR: &str = "JSONStudioData";

/// Directory beside the running executable, if it can be determined.
fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

/// The portable data directory if portable mode is active, else `None`.
fn portable_dir() -> Option<PathBuf> {
    let dir = exe_dir()?;
    let marker = dir.join(PORTABLE_MARKER);
    let data = dir.join(PORTABLE_DIR);
    if marker.exists() || data.is_dir() {
        Some(data)
    } else {
        None
    }
}

/// Resolve the base directory for local data, creating it if needed.
/// Prefers the portable folder beside the executable when in portable mode.
pub fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = match portable_dir() {
        Some(d) => d,
        None => app
            .path()
            .app_config_dir()
            .map_err(|e| format!("cannot resolve config dir: {e}"))?,
    };
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create config dir: {e}"))?;
    Ok(dir)
}

/// Whether the app is currently running in portable mode.
pub fn is_portable() -> bool {
    portable_dir().is_some()
}
