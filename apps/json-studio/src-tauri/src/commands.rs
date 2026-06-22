//! Tauri commands — the typed boundary between the UI and the engine.
//!
//! Security: every path is canonicalized and checked to be a regular file;
//! sizes are bounded; ids and ranges are validated against the registry. Only
//! node-descriptor windows and requested byte/line ranges cross to the UI —
//! never the whole file or the whole tree.

use std::collections::HashSet;
use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::time::Instant;

use json_core::{
    detect_format, line_starts, ArrayMode, DiffResult, DocumentFormat, DocumentIndex,
    DocumentMetadata, JsonNode, JsonlField, JsonlRow, JsonlWindow, NodePath, ParseError,
    QueryResult, SearchOptions, SearchOutcome, MAX_DOCUMENT_BYTES,
};
use memmap2::Mmap;
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::recent::{self, RecentEntry};
use crate::settings;
use crate::state::{AppState, DocBytes, DocumentSession};

#[derive(Serialize)]
pub struct OpenResult {
    pub id: u32,
    pub metadata: DocumentMetadata,
    /// Present when the document could not be parsed as a single JSON value.
    /// The document is still opened so the Raw view can show it.
    pub parse_error: Option<ParseError>,
}

#[derive(Serialize)]
pub struct TreeWindow {
    pub nodes: Vec<JsonNode>,
    /// Total number of currently-visible nodes (for the scrollbar).
    pub total: usize,
}

#[derive(Serialize)]
pub struct RawLines {
    pub lines: Vec<String>,
    pub start_line: usize,
    pub total_lines: usize,
}

fn validate_path(path: &str) -> Result<PathBuf, String> {
    let pb = PathBuf::from(path);
    let canonical = pb
        .canonicalize()
        .map_err(|e| format!("cannot open path: {e}"))?;
    let meta = canonical
        .metadata()
        .map_err(|e| format!("cannot read file metadata: {e}"))?;
    if !meta.is_file() {
        return Err("path is not a regular file".into());
    }
    if meta.len() == 0 {
        return Err("file is empty".into());
    }
    if meta.len() > MAX_DOCUMENT_BYTES {
        return Err(format!(
            "file is larger than the {} GiB limit",
            MAX_DOCUMENT_BYTES / (1024 * 1024 * 1024)
        ));
    }
    Ok(canonical)
}

/// Detect encoding from a sample. Returns (label, needs_reencode).
fn detect_encoding(bytes: &[u8]) -> (&'static encoding_rs::Encoding, bool) {
    let sample = &bytes[..bytes.len().min(64 * 1024)];
    let mut det = chardetng::EncodingDetector::new();
    det.feed(sample, true);
    let enc = det.guess(None, true);
    let needs_reencode = enc != encoding_rs::UTF_8;
    (enc, needs_reencode)
}

#[tauri::command]
pub fn open_document(path: String, state: State<'_, AppState>) -> Result<OpenResult, String> {
    let canonical = validate_path(&path)?;
    let display_path = canonical.to_string_lossy().to_string();
    let file = File::open(&canonical).map_err(|e| format!("cannot open file: {e}"))?;
    let size = file
        .metadata()
        .map_err(|e| format!("cannot stat file: {e}"))?
        .len();

    // SAFETY: the file is opened read-only; for Session A we assume it is not
    // mutated underneath us. File watching (Session C) re-maps on change.
    let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("cannot memory-map file: {e}"))?;

    let (enc, needs_reencode) = detect_encoding(&mmap);
    let (bytes, encoding_label) = if needs_reencode {
        let (decoded, _, _) = enc.decode(&mmap);
        (
            DocBytes::Owned(decoded.into_owned().into_bytes()),
            enc.name().to_string(),
        )
    } else {
        (DocBytes::Mapped(mmap), "UTF-8".to_string())
    };

    let format = detect_format(&display_path);
    let result = register_document(&state, display_path, bytes, size, encoding_label, format)?;
    watch_file(&state, &canonical, result.id);
    Ok(result)
}

/// Build the index + metadata for a document from its bytes and register it in
/// the document registry. Shared by file-open and text-open.
fn register_document(
    state: &State<'_, AppState>,
    display_path: String,
    bytes: DocBytes,
    size: u64,
    encoding: String,
    format: DocumentFormat,
) -> Result<OpenResult, String> {
    let starts = line_starts(&bytes);

    // For single-document JSON we build the lossless index now. JSONL/NDJSON
    // open in Raw + record mode (tree index built per-record in Session C).
    let (index, parse_error): (Option<DocumentIndex>, Option<ParseError>) =
        if format == DocumentFormat::Json {
            match DocumentIndex::build(&bytes) {
                Ok(i) => (Some(i), None),
                Err(e) => (None, Some(e)),
            }
        } else {
            (None, None)
        };

    let mut expanded = HashSet::new();
    if let Some(idx) = &index {
        if let Some(root) = idx.root() {
            expanded.insert(root);
        }
    }

    let metadata = match &index {
        Some(idx) => idx.metadata(display_path.clone(), size, encoding.clone(), format),
        None => DocumentMetadata {
            path: display_path.clone(),
            size_bytes: size,
            encoding: encoding.clone(),
            format,
            line_count: starts.len() as u32,
            node_count: 0,
            modified_on_disk: false,
        },
    };

    let id = state.next_id();
    let session = DocumentSession {
        path: PathBuf::from(&display_path),
        bytes,
        size,
        encoding,
        format,
        index,
        line_starts: starts,
        expanded,
        query_value: None,
        records: None,
    };
    state
        .docs
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?
        .insert(id, session);

    Ok(OpenResult {
        id,
        metadata,
        parse_error,
    })
}

/// Open a document from an in-memory string (e.g. pasted JSON). Not backed by a
/// file, so it is not added to recent files.
#[tauri::command]
pub fn open_text(
    name: String,
    text: String,
    state: State<'_, AppState>,
) -> Result<OpenResult, String> {
    if text.trim().is_empty() {
        return Err("nothing to open: the text is empty".into());
    }
    let display = if name.trim().is_empty() {
        "pasted.json".to_string()
    } else {
        name
    };
    let format = detect_format(&display);
    let bytes = DocBytes::Owned(text.into_bytes());
    let size = bytes.len() as u64;
    register_document(&state, display, bytes, size, "UTF-8".to_string(), format)
}

/// Replace the content of an existing (scratch) document in place and re-index.
/// Keeps the same document id so tabs and diff selections stay stable.
#[tauri::command]
pub fn update_text(
    id: u32,
    text: String,
    state: State<'_, AppState>,
) -> Result<OpenResult, String> {
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;

    let bytes = DocBytes::Owned(text.into_bytes());
    let size = bytes.len() as u64;
    let format = s.format;
    let starts = line_starts(&bytes);
    let (index, parse_error): (Option<DocumentIndex>, Option<ParseError>) =
        if format == DocumentFormat::Json {
            match DocumentIndex::build(&bytes) {
                Ok(i) => (Some(i), None),
                Err(e) => (None, Some(e)),
            }
        } else {
            (None, None)
        };

    let mut expanded = HashSet::new();
    if let Some(idx) = &index {
        if let Some(root) = idx.root() {
            expanded.insert(root);
        }
    }

    let display_path = s.path.to_string_lossy().to_string();
    let metadata = match &index {
        Some(idx) => idx.metadata(display_path.clone(), size, "UTF-8".to_string(), format),
        None => DocumentMetadata {
            path: display_path,
            size_bytes: size,
            encoding: "UTF-8".to_string(),
            format,
            line_count: starts.len() as u32,
            node_count: 0,
            modified_on_disk: false,
        },
    };

    s.bytes = bytes;
    s.size = size;
    s.index = index;
    s.line_starts = starts;
    s.expanded = expanded;
    s.query_value = None;
    s.records = None;

    Ok(OpenResult {
        id,
        metadata,
        parse_error,
    })
}

#[tauri::command]
pub fn close_document(id: u32, state: State<'_, AppState>) -> Result<(), String> {
    state
        .docs
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?
        .remove(&id);
    if let Ok(mut w) = state.watched.lock() {
        w.retain(|_, v| *v != id);
    }
    Ok(())
}

#[tauri::command]
pub fn get_metadata(id: u32, state: State<'_, AppState>) -> Result<DocumentMetadata, String> {
    let docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get(&id).ok_or("unknown document id")?;
    let md = match &s.index {
        Some(idx) => idx.metadata(
            s.path.to_string_lossy().to_string(),
            s.size,
            s.encoding.clone(),
            s.format,
        ),
        None => DocumentMetadata {
            path: s.path.to_string_lossy().to_string(),
            size_bytes: s.size,
            encoding: s.encoding.clone(),
            format: s.format,
            line_count: s.line_starts.len() as u32,
            node_count: 0,
            modified_on_disk: false,
        },
    };
    Ok(md)
}

#[tauri::command]
pub fn get_tree_window(
    id: u32,
    offset: usize,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<TreeWindow, String> {
    let limit = limit.min(5_000); // guard against pathological requests
    let docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get(&id).ok_or("unknown document id")?;
    let idx = s
        .index
        .as_ref()
        .ok_or("document has no parsed tree (open it in Raw view)")?;
    let (ids, total) = idx.visible_window(&s.expanded, offset, limit);
    let nodes = ids.iter().map(|&n| idx.to_node(s.slice(), n)).collect();
    Ok(TreeWindow { nodes, total })
}

/// Run a closure with read access to the index and mutable access to the
/// expanded set. These are disjoint fields, so the borrow checker permits the
/// simultaneous borrows without any unsafe code.
fn with_index_mut<R>(
    id: u32,
    state: &State<'_, AppState>,
    f: impl FnOnce(&DocumentIndex, &mut HashSet<u32>) -> R,
) -> Result<R, String> {
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;
    let idx = s.index.as_ref().ok_or("document has no parsed tree")?;
    Ok(f(idx, &mut s.expanded))
}

#[tauri::command]
pub fn set_node_expanded(
    id: u32,
    node_id: u32,
    expanded: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    with_index_mut(id, &state, |idx, set| {
        if (node_id as usize) < idx.len() {
            if expanded {
                set.insert(node_id);
            } else {
                set.remove(&node_id);
            }
        }
    })
}

#[tauri::command]
pub fn set_subtree_expanded(
    id: u32,
    node_id: u32,
    expanded: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    with_index_mut(id, &state, |idx, set| {
        if (node_id as usize) >= idx.len() {
            return;
        }
        let node = idx.nodes[node_id as usize];
        for i in node_id..node.subtree_end {
            if idx.nodes[i as usize].kind.is_container() {
                if expanded {
                    set.insert(i);
                } else {
                    set.remove(&i);
                }
            }
        }
    })
}

#[tauri::command]
pub fn expand_to_depth(
    id: u32,
    depth: u32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    with_index_mut(id, &state, |idx, set| {
        set.clear();
        for (i, n) in idx.nodes.iter().enumerate() {
            if n.kind.is_container() && n.depth < depth {
                set.insert(i as u32);
            }
        }
    })
}

#[tauri::command]
pub fn collapse_all(id: u32, state: State<'_, AppState>) -> Result<(), String> {
    with_index_mut(id, &state, |idx, set| {
        set.clear();
        if let Some(root) = idx.root() {
            set.insert(root);
        }
    })
}

#[tauri::command]
pub fn get_node_value(
    id: u32,
    node_id: u32,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get(&id).ok_or("unknown document id")?;
    let idx = s.index.as_ref().ok_or("document has no parsed tree")?;
    if (node_id as usize) >= idx.len() {
        return Err("unknown node id".into());
    }
    Ok(idx.raw(s.slice(), node_id).to_string())
}

#[tauri::command]
pub fn get_node_path(
    id: u32,
    node_id: u32,
    state: State<'_, AppState>,
) -> Result<NodePath, String> {
    let docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get(&id).ok_or("unknown document id")?;
    let idx = s.index.as_ref().ok_or("document has no parsed tree")?;
    if (node_id as usize) >= idx.len() {
        return Err("unknown node id".into());
    }
    Ok(idx.node_path(s.slice(), node_id))
}

#[tauri::command]
pub fn get_raw_lines(
    id: u32,
    start_line: usize,
    count: usize,
    state: State<'_, AppState>,
) -> Result<RawLines, String> {
    let count = count.min(5_000);
    let docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get(&id).ok_or("unknown document id")?;
    let bytes = s.slice();
    let starts = &s.line_starts;
    let total = starts.len();
    let mut lines = Vec::new();
    let end_line = (start_line + count).min(total);
    for li in start_line..end_line {
        let begin = starts[li] as usize;
        let stop = if li + 1 < total {
            starts[li + 1] as usize
        } else {
            bytes.len()
        };
        let mut e = stop;
        if e > begin && bytes[e - 1] == b'\n' {
            e -= 1;
        }
        if e > begin && bytes[e - 1] == b'\r' {
            e -= 1;
        }
        lines.push(String::from_utf8_lossy(&bytes[begin..e]).into_owned());
    }
    Ok(RawLines {
        lines,
        start_line,
        total_lines: total,
    })
}

// ---- Search (Phase 7) ----

#[tauri::command]
pub fn run_search(
    id: u32,
    options: SearchOptions,
    state: State<'_, AppState>,
) -> Result<SearchOutcome, String> {
    let docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get(&id).ok_or("unknown document id")?;
    let idx = s
        .index
        .as_ref()
        .ok_or("document has no parsed tree to search")?;
    let started = Instant::now();
    let (results, truncated) = json_core::search::search(idx, s.slice(), &options)?;
    Ok(SearchOutcome {
        results,
        truncated,
        duration_ms: started.elapsed().as_millis(),
    })
}

// ---- JSONPath query (Phase 8) ----

/// Build (and cache) the query value for a document, enforcing the size cap.
fn ensure_query_value(s: &mut DocumentSession, cap: u64) -> Result<(), String> {
    if s.query_value.is_some() {
        return Ok(());
    }
    if s.size > cap {
        return Err(format!(
            "document is {} MB; in-memory query/diff is limited to {} MB (raise it in Settings)",
            s.size / (1024 * 1024),
            cap / (1024 * 1024)
        ));
    }
    let value = json_core::query::parse_value(s.slice())?;
    s.query_value = Some(value);
    Ok(())
}

#[tauri::command]
pub fn run_query(
    id: u32,
    expr: String,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<QueryResult, String> {
    let limit = limit.clamp(1, 50_000);
    let cap = state.query_limit_bytes();
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;
    ensure_query_value(s, cap)?;
    let idx = s.index.as_ref().ok_or("document has no parsed tree")?;
    let value = s.query_value.as_ref().expect("value built above");
    let started = Instant::now();
    let (nodes, count, truncated) =
        json_core::query::run_query(idx, &s.bytes, value, &expr, limit)?;
    Ok(QueryResult {
        nodes,
        count,
        execution_ms: started.elapsed().as_millis(),
        truncated,
    })
}

#[tauri::command]
pub fn export_query(
    id: u32,
    expr: String,
    format: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let cap = state.query_limit_bytes();
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;
    ensure_query_value(s, cap)?;
    let idx = s.index.as_ref().ok_or("document has no parsed tree")?;
    let value = s.query_value.as_ref().expect("value built above");
    let (nodes, _count, _truncated) =
        json_core::query::run_query(idx, &s.bytes, value, &expr, 1_000_000)?;
    let bytes = s.slice();
    let parts: Vec<&str> = nodes
        .iter()
        .map(|n| {
            std::str::from_utf8(&bytes[n.byte_start as usize..n.byte_end as usize])
                .unwrap_or("null")
        })
        .collect();
    let out = match format.as_str() {
        "jsonl" | "ndjson" => parts.join("\n"),
        _ => format!("[\n{}\n]", parts.join(",\n")),
    };
    Ok(out)
}

/// Write text to a user-chosen path (from the save dialog). This is the app's
/// own command — not the fs plugin — so capabilities stay minimal.
#[tauri::command]
pub fn save_text(path: String, contents: String) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("empty path".into());
    }
    fs::write(&path, contents).map_err(|e| format!("could not save file: {e}"))
}

// ---- Recent files (Phase 9) ----

#[tauri::command]
pub fn recent_list(app: AppHandle) -> Result<Vec<RecentEntry>, String> {
    recent::load(&app)
}

#[tauri::command]
pub fn recent_add(app: AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    recent::add(&app, path)
}

#[tauri::command]
pub fn recent_remove(app: AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    recent::remove(&app, path)
}

#[tauri::command]
pub fn recent_toggle_pin(app: AppHandle, path: String) -> Result<Vec<RecentEntry>, String> {
    recent::toggle_pin(&app, path)
}

#[tauri::command]
pub fn recent_clear(app: AppHandle) -> Result<Vec<RecentEntry>, String> {
    recent::clear(&app)
}

// ---- File watching (Phase 10) ----

/// Create the OS watcher once at startup and store it in app state. On a change
/// it emits `document-changed` with the affected document id to the frontend.
pub fn init_watcher(app: &AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(
            event.kind,
            notify::EventKind::Modify(_) | notify::EventKind::Create(_) | notify::EventKind::Remove(_)
        ) {
            return;
        }
        let state = handle.state::<AppState>();
        let Ok(watched) = state.watched.lock() else {
            return;
        };
        let mut seen = HashSet::new();
        for p in &event.paths {
            let canon = p.canonicalize().unwrap_or_else(|_| p.clone());
            if let Some(&id) = watched.get(&canon) {
                if seen.insert(id) {
                    let _ = handle.emit("document-changed", id);
                }
            }
        }
    })
    .map_err(|e| format!("cannot create file watcher: {e}"))?;

    let state = app.state::<AppState>();
    *state
        .watcher
        .lock()
        .map_err(|_| "watcher lock poisoned".to_string())? = Some(watcher);
    Ok(())
}

/// Register a file for change notifications (watches its parent directory).
fn watch_file(state: &State<'_, AppState>, path: &Path, id: u32) {
    if let Some(dir) = path.parent() {
        let mut dirs = match state.watched_dirs.lock() {
            Ok(d) => d,
            Err(_) => return,
        };
        if !dirs.contains(dir) {
            if let Ok(mut guard) = state.watcher.lock() {
                if let Some(w) = guard.as_mut() {
                    if w.watch(dir, RecursiveMode::NonRecursive).is_ok() {
                        dirs.insert(dir.to_path_buf());
                    }
                }
            }
        }
    }
    if let Ok(mut w) = state.watched.lock() {
        w.insert(path.to_path_buf(), id);
    }
}

/// Re-read a file-backed document from disk and rebuild its index. Preserves the
/// expansion set (clamped to the new node range). Returns the refreshed result.
#[tauri::command]
pub fn reload_document(id: u32, state: State<'_, AppState>) -> Result<OpenResult, String> {
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;
    let path = s.path.clone();
    let format = s.format;

    let file = File::open(&path).map_err(|e| format!("cannot reopen file: {e}"))?;
    let size = file
        .metadata()
        .map_err(|e| format!("cannot stat file: {e}"))?
        .len();
    let mmap = unsafe { Mmap::map(&file) }.map_err(|e| format!("cannot memory-map file: {e}"))?;
    let (enc, needs_reencode) = detect_encoding(&mmap);
    let (bytes, encoding_label) = if needs_reencode {
        let (decoded, _, _) = enc.decode(&mmap);
        (
            DocBytes::Owned(decoded.into_owned().into_bytes()),
            enc.name().to_string(),
        )
    } else {
        (DocBytes::Mapped(mmap), "UTF-8".to_string())
    };

    let starts = line_starts(&bytes);
    let (index, parse_error): (Option<DocumentIndex>, Option<ParseError>) =
        if format == DocumentFormat::Json {
            match DocumentIndex::build(&bytes) {
                Ok(i) => (Some(i), None),
                Err(e) => (None, Some(e)),
            }
        } else {
            (None, None)
        };

    // Preserve expansion where node ids still exist.
    let mut expanded: HashSet<u32> = std::mem::take(&mut s.expanded);
    match &index {
        Some(idx) => {
            expanded.retain(|nid| (*nid as usize) < idx.len());
            if let Some(root) = idx.root() {
                expanded.insert(root);
            }
        }
        None => expanded.clear(),
    }

    let metadata = match &index {
        Some(idx) => idx.metadata(path.to_string_lossy().to_string(), size, encoding_label.clone(), format),
        None => DocumentMetadata {
            path: path.to_string_lossy().to_string(),
            size_bytes: size,
            encoding: encoding_label.clone(),
            format,
            line_count: starts.len() as u32,
            node_count: 0,
            modified_on_disk: false,
        },
    };

    s.bytes = bytes;
    s.size = size;
    s.encoding = encoding_label;
    s.index = index;
    s.line_starts = starts;
    s.expanded = expanded;
    s.query_value = None;
    s.records = None;

    Ok(OpenResult {
        id,
        metadata,
        parse_error,
    })
}

// ---- JSON Diff (Phase 11) ----

#[tauri::command]
pub fn run_diff(
    left_id: u32,
    right_id: u32,
    mode: ArrayMode,
    state: State<'_, AppState>,
) -> Result<DiffResult, String> {
    const DIFF_LIMIT: usize = 20_000;
    let cap = state.query_limit_bytes();
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;

    // Build query values for both sides (in-memory, size-capped).
    {
        let l = docs.get_mut(&left_id).ok_or("unknown left document")?;
        ensure_query_value(l, cap)?;
    }
    {
        let r = docs.get_mut(&right_id).ok_or("unknown right document")?;
        ensure_query_value(r, cap)?;
    }

    let l = docs.get(&left_id).ok_or("unknown left document")?;
    let r = docs.get(&right_id).ok_or("unknown right document")?;
    let lv = l.query_value.as_ref().expect("value built above");
    let rv = r.query_value.as_ref().expect("value built above");

    let mut result = json_core::diff::diff_values(lv, rv, &mode, DIFF_LIMIT);

    // Resolve source lines per side.
    for e in &mut result.entries {
        if let (Some(idx), Some(ptr)) = (l.index.as_ref(), &e.left_pointer) {
            if let Some(nid) = idx.resolve_pointer(l.slice(), ptr) {
                e.left_line = Some(idx.node_line(nid));
            }
        }
        if let (Some(idx), Some(ptr)) = (r.index.as_ref(), &e.right_pointer) {
            if let Some(nid) = idx.resolve_pointer(r.slice(), ptr) {
                e.right_line = Some(idx.node_line(nid));
            }
        }
    }
    Ok(result)
}

// ---- JSONL / NDJSON table (Phase 12) ----

fn ensure_records(s: &mut DocumentSession) {
    if s.records.is_none() {
        s.records = Some(json_core::jsonl::split_records(&s.bytes));
    }
}

#[tauri::command]
pub fn jsonl_fields(id: u32, state: State<'_, AppState>) -> Result<Vec<JsonlField>, String> {
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;
    ensure_records(s);
    let records = s.records.as_ref().expect("records built above");
    Ok(json_core::jsonl::collect_fields(&s.bytes, records, 2000))
}

#[tauri::command]
pub fn jsonl_window(
    id: u32,
    columns: Vec<String>,
    offset: usize,
    limit: usize,
    state: State<'_, AppState>,
) -> Result<JsonlWindow, String> {
    let limit = limit.min(5_000);
    let mut docs = state.docs.lock().map_err(|_| "state lock poisoned")?;
    let s = docs.get_mut(&id).ok_or("unknown document id")?;
    ensure_records(s);
    let records = s.records.as_ref().expect("records built above");
    let total = records.len();
    let invalid = records.iter().filter(|r| r.error.is_some()).count();
    let starts = &s.line_starts;

    let mut rows = Vec::new();
    let end = (offset + limit).min(total);
    for rec in &records[offset.min(total)..end] {
        let (valid, cells) = json_core::jsonl::record_cells(&s.bytes, rec, &columns);
        let line = match starts.binary_search(&rec.byte_start) {
            Ok(i) => i as u32 + 1,
            Err(i) => i as u32, // i is count of starts <= byte; line is i (1-based via previous)
        };
        rows.push(JsonlRow {
            index: rec.index,
            line: line.max(1),
            valid,
            cells,
        });
    }
    Ok(JsonlWindow {
        rows,
        total,
        invalid,
    })
}

// ---- Settings (Phase 13) ----

#[tauri::command]
pub fn settings_load(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    settings::load(&app)
}

#[tauri::command]
pub fn settings_save(app: AppHandle, value: serde_json::Value) -> Result<(), String> {
    settings::save(&app, &value)
}

/// Set the in-memory cap for query/diff value building (0 = default).
#[tauri::command]
pub fn set_query_limit(bytes: u64, state: State<'_, AppState>) -> Result<(), String> {
    state.set_query_limit(bytes);
    Ok(())
}

// ---- Session (remember open tabs) ----

#[tauri::command]
pub fn session_load(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    settings::session_load(&app)
}

#[tauri::command]
pub fn session_save(app: AppHandle, value: serde_json::Value) -> Result<(), String> {
    settings::session_save(&app, &value)
}
