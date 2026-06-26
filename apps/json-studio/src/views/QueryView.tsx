import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import type { JsonNode } from "@jstools/json-ui";
import { useApp } from "../stores/app";
import {
  exportQuery,
  getNodePath,
  runQuery,
  saveText,
} from "../ipc/commands";

const LIMIT = 5000;

export function QueryView() {
  const tab = useApp((s) => s.activeTab());
  // Select the stable map; derive the per-doc list locally. Returning a fresh
  // array from the selector would loop the store and crash the view.
  const queryHistory = useApp((s) => s.queryHistory);
  const pushQuery = useApp((s) => s.pushQuery);
  const gotoNode = useApp((s) => s.gotoNode);

  const [expr, setExpr] = useState("$");
  const [nodes, setNodes] = useState<JsonNode[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [execMs, setExecMs] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  if (!tab) return null;
  const parsed = tab.metadata.node_count > 0;
  const history = queryHistory[tab.docId] ?? [];

  async function run() {
    if (!tab) return;
    if (!parsed) {
      setError("Document has no parsed tree (open it in Raw view).");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await runQuery(tab.docId, expr, LIMIT);
      setNodes(res.nodes);
      setCount(res.count);
      setExecMs(res.execution_ms);
      setTruncated(res.truncated);
      pushQuery(tab.docId, expr);
    } catch (e) {
      setError(String(e));
      setNodes([]);
      setCount(null);
    } finally {
      setRunning(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  async function copyPaths() {
    if (!tab) return;
    const paths = await Promise.all(
      nodes.map((n) => getNodePath(tab.docId, n.id).then((p) => p.path)),
    );
    await copy(paths.join("\n"));
  }

  async function doExport(format: "json" | "jsonl") {
    if (!tab) return;
    try {
      const contents = await exportQuery(tab.docId, expr, format);
      const path = await save({
        defaultPath: `query-result.${format === "jsonl" ? "jsonl" : "json"}`,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (path) await saveText(path, contents);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="query">
      <div className="query-editor">
        <textarea
          className="query-input"
          spellCheck={false}
          value={expr}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void run();
            }
          }}
          placeholder="JSONPath, e.g. $.store.book[*].author"
        />
        <div className="query-actions">
          <button className="btn primary" onClick={() => void run()} disabled={running}>
            {running ? "Running…" : "Run"}
          </button>
          <button className="btn" disabled title="Queries run locally and return immediately">
            Cancel
          </button>
          {history.length > 0 && (
            <select
              className="query-history"
              value=""
              onChange={(e) => {
                if (e.target.value) setExpr(e.target.value);
              }}
            >
              <option value="">History…</option>
              {history.map((h, i) => (
                <option key={i} value={h}>
                  {h}
                </option>
              ))}
            </select>
          )}
          <div style={{ flex: 1 }} />
          {count != null && (
            <span className="query-meta">
              {count} match{count === 1 ? "" : "es"}
              {truncated ? " (truncated)" : ""} · {execMs} ms
            </span>
          )}
        </div>
        {nodes.length > 0 && (
          <div className="query-actions">
            <button className="btn" onClick={() => void copyPaths()}>
              Copy paths
            </button>
            <button
              className="btn"
              onClick={() =>
                void exportQuery(tab!.docId, expr, "json").then((t) => copy(t))
              }
            >
              Copy result
            </button>
            <button className="btn" onClick={() => void doExport("json")}>
              Export JSON
            </button>
            <button className="btn" onClick={() => void doExport("jsonl")}>
              Export JSONL
            </button>
          </div>
        )}
      </div>

      {error && <div className="parse-error-banner">{error}</div>}

      <div className="query-results">
        {count === null && !error && (
          <div className="query-empty">
            Enter a JSONPath and press Run (⌘/Ctrl+Enter).
            <br />
            Examples: <code>$</code> (root), <code>$[*]</code> (array items),{" "}
            <code>$.store.book[*].author</code>, <code>$..price</code>
          </div>
        )}
        {count === 0 && !error && (
          <div className="query-empty">
            No matches for <code>{expr}</code>. If the root is an array, try{" "}
            <code>$[*]</code>.
          </div>
        )}
        {nodes.map((n) => (
          <button
            key={n.id}
            className="search-hit"
            onClick={() => gotoNode(tab!.docId, n.id)}
            title={`Reveal in tree · line ${n.line}`}
          >
            <span className="hit-kind value">{n.value_type[0]?.toUpperCase()}</span>
            <span className={`hit-preview ${n.value_type}`}>{n.preview}</span>
            <span className="hit-line">L{n.line}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
