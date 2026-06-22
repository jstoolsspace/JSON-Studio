import { invoke } from "@tauri-apps/api/core";
import type {
  ArrayMode,
  DiffResult,
  DocumentMetadata,
  JsonlField,
  JsonlWindow,
  NodePath,
  OpenResult,
  QueryResult,
  RawLines,
  RecentEntry,
  SearchOptions,
  SearchOutcome,
  TreeWindow,
} from "@jstools/json-ui";

// Thin, typed wrappers over the Rust command surface. The UI never touches the
// filesystem or the raw document directly — it asks the backend for windows.

export function openDocument(path: string): Promise<OpenResult> {
  return invoke<OpenResult>("open_document", { path });
}

export function openText(name: string, text: string): Promise<OpenResult> {
  return invoke<OpenResult>("open_text", { name, text });
}

export function updateText(id: number, text: string): Promise<OpenResult> {
  return invoke<OpenResult>("update_text", { id, text });
}

export function closeDocument(id: number): Promise<void> {
  return invoke<void>("close_document", { id });
}

export function getMetadata(id: number): Promise<DocumentMetadata> {
  return invoke<DocumentMetadata>("get_metadata", { id });
}

export function getTreeWindow(
  id: number,
  offset: number,
  limit: number,
): Promise<TreeWindow> {
  return invoke<TreeWindow>("get_tree_window", { id, offset, limit });
}

export function setNodeExpanded(
  id: number,
  nodeId: number,
  expanded: boolean,
): Promise<void> {
  return invoke<void>("set_node_expanded", { id, nodeId, expanded });
}

export function setSubtreeExpanded(
  id: number,
  nodeId: number,
  expanded: boolean,
): Promise<void> {
  return invoke<void>("set_subtree_expanded", { id, nodeId, expanded });
}

export function expandToDepth(id: number, depth: number): Promise<void> {
  return invoke<void>("expand_to_depth", { id, depth });
}

export function collapseAll(id: number): Promise<void> {
  return invoke<void>("collapse_all", { id });
}

export function getNodeValue(id: number, nodeId: number): Promise<string> {
  return invoke<string>("get_node_value", { id, nodeId });
}

export function getNodePath(id: number, nodeId: number): Promise<NodePath> {
  return invoke<NodePath>("get_node_path", { id, nodeId });
}

export function getRawLines(
  id: number,
  startLine: number,
  count: number,
): Promise<RawLines> {
  return invoke<RawLines>("get_raw_lines", { id, startLine, count });
}

// ---- Session B ----

export function runSearch(
  id: number,
  options: SearchOptions,
): Promise<SearchOutcome> {
  return invoke<SearchOutcome>("run_search", { id, options });
}

export function runQuery(
  id: number,
  expr: string,
  limit: number,
): Promise<QueryResult> {
  return invoke<QueryResult>("run_query", { id, expr, limit });
}

export function exportQuery(
  id: number,
  expr: string,
  format: "json" | "jsonl",
): Promise<string> {
  return invoke<string>("export_query", { id, expr, format });
}

export function saveText(path: string, contents: string): Promise<void> {
  return invoke<void>("save_text", { path, contents });
}

export function recentList(): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>("recent_list", {});
}

export function recentAdd(path: string): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>("recent_add", { path });
}

export function recentRemove(path: string): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>("recent_remove", { path });
}

export function recentTogglePin(path: string): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>("recent_toggle_pin", { path });
}

export function recentClear(): Promise<RecentEntry[]> {
  return invoke<RecentEntry[]>("recent_clear", {});
}

// ---- Session C ----

export function reloadDocument(id: number): Promise<OpenResult> {
  return invoke<OpenResult>("reload_document", { id });
}

export function runDiff(
  leftId: number,
  rightId: number,
  mode: ArrayMode,
): Promise<DiffResult> {
  return invoke<DiffResult>("run_diff", { leftId, rightId, mode });
}

export function jsonlFields(id: number): Promise<JsonlField[]> {
  return invoke<JsonlField[]>("jsonl_fields", { id });
}

export function jsonlWindow(
  id: number,
  columns: string[],
  offset: number,
  limit: number,
): Promise<JsonlWindow> {
  return invoke<JsonlWindow>("jsonl_window", { id, columns, offset, limit });
}

export function settingsLoad(): Promise<unknown> {
  return invoke<unknown>("settings_load", {});
}

export function settingsSave(value: Record<string, unknown>): Promise<void> {
  return invoke<void>("settings_save", { value });
}

export function setQueryLimit(bytes: number): Promise<void> {
  return invoke<void>("set_query_limit", { bytes });
}

export function sessionLoad(): Promise<unknown> {
  return invoke<unknown>("session_load", {});
}

export function sessionSave(value: {
  paths: string[];
  active: string | null;
}): Promise<void> {
  return invoke<void>("session_save", { value });
}
