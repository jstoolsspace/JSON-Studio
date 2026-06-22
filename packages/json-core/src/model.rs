//! Shared data model for the JSON engine.
//!
//! These types are the contract between the Rust engine, the Tauri host and the
//! TypeScript UI. The UI mirrors them in `packages/json-ui/src/types`. Keep the
//! two in sync (a future task wires `specta`/`tauri-specta` to generate them).

use serde::{Deserialize, Serialize};

/// Hard upper bound on file size. Byte offsets are stored as `u32`, so the
/// engine supports documents up to 4 GiB. The product target is 500 MB.
pub const MAX_DOCUMENT_BYTES: u64 = u32::MAX as u64;

/// The JSON value kind of a node.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ValueType {
    String,
    Number,
    Boolean,
    Null,
    Object,
    Array,
}

impl ValueType {
    pub fn is_container(self) -> bool {
        matches!(self, ValueType::Object | ValueType::Array)
    }
}

/// Document format detected from extension/content.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DocumentFormat {
    Json,
    Jsonl,
    Ndjson,
}

/// A normalized JSONPath string to a node, e.g. `$.a.b[2]`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JsonPath(pub String);

/// An RFC 6901 JSON Pointer, e.g. `/a/b/2`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct JsonPointer(pub String);

/// A node descriptor sent to the UI. It is *not* the value itself — values are
/// materialized lazily from byte spans via [`crate::index::DocumentIndex`].
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonNode {
    /// Stable id == position in the pre-order node index.
    pub id: u32,
    pub parent_id: Option<u32>,
    /// Decoded object-member key (None for array elements / root).
    pub key: Option<String>,
    /// Array index (None for object members / root).
    pub array_index: Option<u32>,
    pub value_type: ValueType,
    /// Number of direct children (0 for scalars).
    pub child_count: u32,
    pub depth: u32,
    /// Byte span of the node's raw value in the source document.
    pub byte_start: u64,
    pub byte_end: u64,
    /// 1-based line/column of the value start.
    pub line: u32,
    pub column: u32,
    /// Truncated, lossless raw preview of the value.
    pub preview: String,
}

/// The path identity of a node, computed on demand (copy actions).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePath {
    pub path: JsonPath,
    pub pointer: JsonPointer,
}

/// A search hit.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub node_id: u32,
    pub path: JsonPath,
    pub pointer: JsonPointer,
    pub value_type: ValueType,
    pub preview: String,
    pub line: u32,
    pub match_kind: MatchKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchKind {
    Key,
    Value,
}

/// Options for a search run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub query: String,
    pub in_keys: bool,
    pub in_values: bool,
    pub case_sensitive: bool,
    /// Match the whole field rather than a substring.
    pub exact: bool,
    /// Treat `query` as a regular expression.
    pub regex: bool,
    /// Restrict the search to the subtree rooted at this node id.
    pub subtree_root: Option<u32>,
    /// Maximum number of results to return.
    pub limit: usize,
}

/// Outcome of a search run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOutcome {
    pub results: Vec<SearchResult>,
    /// True if more matches existed than `limit`.
    pub truncated: bool,
    pub duration_ms: u128,
}

/// The result of a JSONPath query (Session B).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryResult {
    pub nodes: Vec<JsonNode>,
    pub count: usize,
    pub execution_ms: u128,
    pub truncated: bool,
}

/// A parse error with precise source location.
#[derive(Debug, Clone, thiserror::Error, Serialize, Deserialize)]
#[error("{message} at line {line}, column {column} (byte {byte_offset})")]
pub struct ParseError {
    pub message: String,
    pub line: u32,
    pub column: u32,
    pub byte_offset: u64,
}

// ---- Diff (Phase 11) ----

/// How array elements are matched during a diff.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ArrayMode {
    /// Compare element-by-element by position.
    #[default]
    ByIndex,
    /// Match elements by a shared key field (objects only); fall back to index.
    ByKey { key: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeKind {
    Added,
    Removed,
    Changed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffEntry {
    pub kind: ChangeKind,
    /// Human-readable location for display.
    pub path: String,
    /// JSON Pointer into each side (None when the value is absent on that side).
    /// Separate pointers are needed because match-by-key can pair elements at
    /// different array indices.
    pub left_pointer: Option<String>,
    pub right_pointer: Option<String>,
    /// Compact preview of the left/right value.
    pub left: Option<String>,
    pub right: Option<String>,
    /// 1-based source line in each document, resolved by the host.
    pub left_line: Option<u32>,
    pub right_line: Option<u32>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DiffSummary {
    pub added: usize,
    pub removed: usize,
    pub changed: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub entries: Vec<DiffEntry>,
    pub summary: DiffSummary,
    pub truncated: bool,
}

// ---- JSONL / NDJSON table (Phase 12) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonlField {
    pub name: String,
    /// Number of records that contain this top-level field.
    pub count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonlRow {
    pub index: u32,
    pub line: u32,
    pub valid: bool,
    /// Cell previews keyed by column name (only requested columns).
    pub cells: Vec<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonlWindow {
    pub rows: Vec<JsonlRow>,
    pub total: usize,
    pub invalid: usize,
}

/// Metadata about an opened document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub path: String,
    pub size_bytes: u64,
    pub encoding: String,
    pub format: DocumentFormat,
    pub line_count: u32,
    /// Number of nodes in the index (after a successful parse).
    pub node_count: u32,
    pub modified_on_disk: bool,
}
