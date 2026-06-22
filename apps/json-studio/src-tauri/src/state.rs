//! In-memory registry of open documents.
//!
//! The host owns the bytes (memory-mapped where possible) and the parsed index.
//! Only windows of node descriptors and requested ranges ever cross to the UI.

use std::collections::{HashMap, HashSet};
use std::ops::Deref;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::sync::Mutex;

/// Default in-memory cap for building a query/diff value (64 MiB).
pub const DEFAULT_QUERY_LIMIT_BYTES: u64 = 64 * 1024 * 1024;

use json_core::jsonl::Record;
use json_core::{DocumentFormat, DocumentIndex};
use memmap2::Mmap;

/// The OS file watcher type used for change notifications.
pub type FsWatcher = notify::RecommendedWatcher;

/// Backing bytes for a document: memory-mapped for UTF-8 files, or an owned,
/// re-encoded buffer for non-UTF-8 inputs.
pub enum DocBytes {
    Mapped(Mmap),
    Owned(Vec<u8>),
}

impl Deref for DocBytes {
    type Target = [u8];
    fn deref(&self) -> &[u8] {
        match self {
            DocBytes::Mapped(m) => m,
            DocBytes::Owned(v) => v,
        }
    }
}

pub struct DocumentSession {
    pub path: PathBuf,
    pub bytes: DocBytes,
    pub size: u64,
    pub encoding: String,
    pub format: DocumentFormat,
    pub index: Option<DocumentIndex>,
    /// Byte offset of the start of every line (for the Raw view).
    pub line_starts: Vec<u32>,
    /// Node ids that are currently expanded in the tree.
    pub expanded: HashSet<u32>,
    /// Lazily-built lossless value for JSONPath queries (in-memory, size-capped).
    pub query_value: Option<serde_json::Value>,
    /// Lazily-built record boundaries for JSONL/NDJSON documents.
    pub records: Option<Vec<Record>>,
}

impl DocumentSession {
    pub fn slice(&self) -> &[u8] {
        &self.bytes
    }
}

#[derive(Default)]
pub struct AppState {
    pub docs: Mutex<HashMap<u32, DocumentSession>>,
    next_id: AtomicU32,
    /// The OS watcher (created once at startup).
    pub watcher: Mutex<Option<FsWatcher>>,
    /// Canonical file path -> document id, for routing change events.
    pub watched: Mutex<HashMap<PathBuf, u32>>,
    /// Directories currently registered with the watcher (deduped).
    pub watched_dirs: Mutex<HashSet<PathBuf>>,
    /// Configurable query/diff memory cap (0 = use the default).
    pub query_limit: AtomicU64,
}

impl AppState {
    pub fn next_id(&self) -> u32 {
        self.next_id.fetch_add(1, Ordering::Relaxed)
    }

    pub fn query_limit_bytes(&self) -> u64 {
        let v = self.query_limit.load(Ordering::Relaxed);
        if v == 0 {
            DEFAULT_QUERY_LIMIT_BYTES
        } else {
            v
        }
    }

    pub fn set_query_limit(&self, bytes: u64) {
        self.query_limit.store(bytes, Ordering::Relaxed);
    }
}
