// TypeScript mirror of `json-core::model`.
// Keep in sync with packages/json-core/src/model.rs.
// (A future task wires specta/tauri-specta to generate this automatically.)

export type ValueType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "object"
  | "array";

export type DocumentFormat = "json" | "jsonl" | "ndjson";

export type MatchKind = "key" | "value";

export interface JsonNode {
  id: number;
  parent_id: number | null;
  key: string | null;
  array_index: number | null;
  value_type: ValueType;
  child_count: number;
  depth: number;
  byte_start: number;
  byte_end: number;
  line: number;
  column: number;
  preview: string;
}

export interface NodePath {
  path: string;
  pointer: string;
}

export interface ParseError {
  message: string;
  line: number;
  column: number;
  byte_offset: number;
}

export interface DocumentMetadata {
  path: string;
  size_bytes: number;
  encoding: string;
  format: DocumentFormat;
  line_count: number;
  node_count: number;
  modified_on_disk: boolean;
}

export interface SearchResult {
  node_id: number;
  path: string;
  pointer: string;
  value_type: ValueType;
  preview: string;
  line: number;
  match_kind: MatchKind;
}

export interface SearchOptions {
  query: string;
  in_keys: boolean;
  in_values: boolean;
  case_sensitive: boolean;
  exact: boolean;
  regex: boolean;
  subtree_root: number | null;
  limit: number;
}

export interface SearchOutcome {
  results: SearchResult[];
  truncated: boolean;
  duration_ms: number;
}

export interface RecentEntry {
  path: string;
  name: string;
  pinned: boolean;
  opened_at: number;
}

// ---- Diff ----

export type ChangeKind = "added" | "removed" | "changed";

export type ArrayMode =
  | { mode: "by_index" }
  | { mode: "by_key"; key: string };

export interface DiffEntry {
  kind: ChangeKind;
  path: string;
  left_pointer: string | null;
  right_pointer: string | null;
  left: string | null;
  right: string | null;
  left_line: number | null;
  right_line: number | null;
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
}

export interface DiffResult {
  entries: DiffEntry[];
  summary: DiffSummary;
  truncated: boolean;
}

// ---- JSONL / NDJSON ----

export interface JsonlField {
  name: string;
  count: number;
}

export interface JsonlRow {
  index: number;
  line: number;
  valid: boolean;
  cells: (string | null)[];
}

export interface JsonlWindow {
  rows: JsonlRow[];
  total: number;
  invalid: number;
}

export interface QueryResult {
  nodes: JsonNode[];
  count: number;
  execution_ms: number;
  truncated: boolean;
}

// ---- Command result shapes (from src-tauri/commands.rs) ----

export interface OpenResult {
  id: number;
  metadata: DocumentMetadata;
  parse_error: ParseError | null;
}

export interface TreeWindow {
  nodes: JsonNode[];
  total: number;
}

export interface RawLines {
  lines: string[];
  start_line: number;
  total_lines: number;
}
