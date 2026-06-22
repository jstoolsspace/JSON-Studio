//! Recent files, persisted locally in the app config directory.
//!
//! Stored as plain JSON on the user's machine. Nothing leaves the device — no
//! telemetry, no cloud (see PRIVACY.md). Pinned entries are kept indefinitely;
//! unpinned entries are trimmed to `MAX_RECENT`.

use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const MAX_RECENT: usize = 30;
const FILE_NAME: &str = "recent.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentEntry {
    pub path: String,
    pub name: String,
    pub pinned: bool,
    /// Unix epoch milliseconds of the last open.
    pub opened_at: u64,
}

fn base_name(path: &str) -> String {
    path.rsplit(['/', '\\']).next().unwrap_or(path).to_string()
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("cannot resolve config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create config dir: {e}"))?;
    Ok(dir.join(FILE_NAME))
}

pub fn load(app: &AppHandle) -> Result<Vec<RecentEntry>, String> {
    let p = store_path(app)?;
    match fs::read(&p) {
        Ok(bytes) => Ok(serde_json::from_slice(&bytes).unwrap_or_default()),
        Err(_) => Ok(Vec::new()),
    }
}

fn save(app: &AppHandle, entries: &[RecentEntry]) -> Result<(), String> {
    let p = store_path(app)?;
    let json = serde_json::to_vec_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| format!("cannot write recent files: {e}"))
}

fn sort_and_trim(mut entries: Vec<RecentEntry>) -> Vec<RecentEntry> {
    // Pinned first, then most-recent first.
    entries.sort_by(|a, b| {
        b.pinned
            .cmp(&a.pinned)
            .then(b.opened_at.cmp(&a.opened_at))
    });
    // Trim only the unpinned tail.
    let mut pinned: Vec<RecentEntry> = entries.iter().filter(|e| e.pinned).cloned().collect();
    let unpinned: Vec<RecentEntry> = entries
        .into_iter()
        .filter(|e| !e.pinned)
        .take(MAX_RECENT)
        .collect();
    pinned.extend(unpinned);
    pinned
}

pub fn add(app: &AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load(app)?;
    if let Some(existing) = entries.iter_mut().find(|e| e.path == path) {
        existing.opened_at = now_ms();
    } else {
        entries.push(RecentEntry {
            name: base_name(&path),
            path,
            pinned: false,
            opened_at: now_ms(),
        });
    }
    let entries = sort_and_trim(entries);
    save(app, &entries)?;
    Ok(entries)
}

pub fn remove(app: &AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load(app)?;
    entries.retain(|e| e.path != path);
    save(app, &entries)?;
    Ok(entries)
}

pub fn toggle_pin(app: &AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    let mut entries = load(app)?;
    if let Some(e) = entries.iter_mut().find(|e| e.path == path) {
        e.pinned = !e.pinned;
    }
    let entries = sort_and_trim(entries);
    save(app, &entries)?;
    Ok(entries)
}

pub fn clear(app: &AppHandle) -> Result<Vec<RecentEntry>, String> {
    save(app, &[])?;
    Ok(Vec::new())
}
