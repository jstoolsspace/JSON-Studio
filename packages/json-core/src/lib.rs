//! # json-core
//!
//! The reusable, Tauri-free JSON engine behind JSTools JSON Studio.
//!
//! Design goals:
//! * **Lossless** — values are kept as byte spans, never parsed into `f64`/`String`,
//!   so big integers, full-precision decimals, key order and the exact source
//!   representation survive round-trips.
//! * **Bounded memory** — a compact pre-order node index (~tens of bytes/node)
//!   plus a line table; raw bytes stay external (memory-mapped by the host).
//! * **Reusable** — no Tauri/OS dependency; also compiles to wasm (`feature = "wasm"`)
//!   for a future browser extension.
//!
//! Sessions B/C add `search`, `query`, `diff` modules on top of [`index::DocumentIndex`].

pub mod diff;
pub mod index;
pub mod jsonl;
pub mod model;
pub mod parse;
pub mod query;
pub mod search;

pub use index::DocumentIndex;
pub use model::{
    ArrayMode, ChangeKind, DiffEntry, DiffResult, DiffSummary, DocumentFormat, DocumentMetadata,
    JsonNode, JsonPath, JsonPointer, JsonlField, JsonlRow, JsonlWindow, MatchKind, NodePath,
    ParseError, QueryResult, SearchOptions, SearchOutcome, SearchResult, ValueType,
    MAX_DOCUMENT_BYTES,
};

/// Detect a document format from its file extension (case-insensitive).
pub fn detect_format(path: &str) -> DocumentFormat {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".ndjson") {
        DocumentFormat::Ndjson
    } else if lower.ends_with(".jsonl") {
        DocumentFormat::Jsonl
    } else {
        DocumentFormat::Json
    }
}

/// Compute the byte offset of the start of every line in `bytes`.
/// Used by the Raw view to render line ranges without materializing the file.
pub fn line_starts(bytes: &[u8]) -> Vec<u32> {
    let mut starts = vec![0u32];
    for (i, &b) in bytes.iter().enumerate() {
        if b == b'\n' {
            starts.push((i + 1) as u32);
        }
    }
    starts
}
