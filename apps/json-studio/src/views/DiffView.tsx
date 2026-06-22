import { useEffect, useMemo, useState } from "react";
import type { ArrayMode, ChangeKind, DiffResult } from "@jstools/json-ui";
import { useApp } from "../stores/app";
import { runDiff } from "../ipc/commands";

const KINDS: ChangeKind[] = ["added", "removed", "changed"];

export function DiffView() {
  const tabs = useApp((s) => s.tabs);
  const active = useApp((s) => s.activeId);
  const gotoLine = useApp((s) => s.gotoLine);

  // Diff needs a single parseable JSON document on each side; exclude
  // JSONL/NDJSON and unparseable tabs.
  const eligible = tabs.filter(
    (t) => t.metadata.format === "json" && t.metadata.node_count > 0,
  );

  const [leftId, setLeftId] = useState<number | null>(active);
  const [rightId, setRightId] = useState<number | null>(null);
  const [mode, setMode] = useState<"by_index" | "by_key">("by_index");
  const [keyField, setKeyField] = useState("id");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [filter, setFilter] = useState<Set<ChangeKind>>(new Set(KINDS));
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Pick sensible default documents (from eligible JSON tabs).
  useEffect(() => {
    if (leftId == null && eligible[0]) setLeftId(eligible[0].docId);
    if (rightId == null) {
      const other = eligible.find(
        (t) => t.docId !== (leftId ?? eligible[0]?.docId),
      );
      if (other) setRightId(other.docId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, leftId, rightId]);

  async function run() {
    if (leftId == null || rightId == null) {
      setError("Pick two documents to compare.");
      return;
    }
    if (leftId === rightId) {
      setError("Pick two different documents.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const arrayMode: ArrayMode =
        mode === "by_key" ? { mode: "by_key", key: keyField } : { mode: "by_index" };
      setResult(await runDiff(leftId, rightId, arrayMode));
    } catch (e) {
      setError(String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  const entries = useMemo(
    () => (result ? result.entries.filter((e) => filter.has(e.kind)) : []),
    [result, filter],
  );

  function toggleFilter(k: ChangeKind) {
    setFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  if (eligible.length < 2) {
    return (
      <div className="placeholder">
        <div>
          Open two parseable JSON documents to compare them here.
          <br />
          (JSONL/NDJSON and files with parse errors can't be diffed.)
        </div>
      </div>
    );
  }

  return (
    <div className="diff">
      <div className="diff-bar">
        <select
          className="query-history"
          value={leftId ?? ""}
          onChange={(e) => setLeftId(Number(e.target.value))}
        >
          {eligible.map((t) => (
            <option key={t.docId} value={t.docId}>
              {t.name}
            </option>
          ))}
        </select>
        <span style={{ color: "var(--fg-faint)" }}>vs</span>
        <select
          className="query-history"
          value={rightId ?? ""}
          onChange={(e) => setRightId(Number(e.target.value))}
        >
          {eligible.map((t) => (
            <option key={t.docId} value={t.docId}>
              {t.name}
            </option>
          ))}
        </select>

        <select
          className="query-history"
          value={mode}
          onChange={(e) => setMode(e.target.value as "by_index" | "by_key")}
          title="How array elements are matched"
        >
          <option value="by_index">Arrays: by index</option>
          <option value="by_key">Arrays: by key</option>
        </select>
        {mode === "by_key" && (
          <input
            className="search-input"
            style={{ width: 90 }}
            value={keyField}
            onChange={(e) => setKeyField(e.target.value)}
            placeholder="key"
          />
        )}

        <button className="btn primary" onClick={() => void run()} disabled={running}>
          {running ? "Comparing…" : "Compare"}
        </button>

        {result && (
          <div className="diff-summary">
            {KINDS.map((k) => (
              <button
                key={k}
                className={`diff-chip ${k}${filter.has(k) ? " on" : ""}`}
                onClick={() => toggleFilter(k)}
              >
                {k} {result.summary[k]}
              </button>
            ))}
            {result.truncated && <span className="search-meta">truncated</span>}
          </div>
        )}
      </div>

      {error && <div className="parse-error-banner">{error}</div>}

      <div className="diff-results">
        {result && entries.length === 0 && !error && (
          <div className="query-empty">No differences for the current filter.</div>
        )}
        {entries.map((e, i) => (
          <div key={i} className={`diff-row ${e.kind}`}>
            <span className={`diff-tag ${e.kind}`}>{e.kind[0]?.toUpperCase()}</span>
            <span className="diff-path">{e.path}</span>
            <button
              className="diff-side left"
              disabled={e.left_line == null || leftId == null}
              onClick={() => leftId != null && e.left_line != null && gotoLine(leftId, e.left_line)}
              title={e.left_line != null ? `left line ${e.left_line}` : "absent"}
            >
              {e.left ?? "—"}
            </button>
            <span className="diff-arrow">→</span>
            <button
              className="diff-side right"
              disabled={e.right_line == null || rightId == null}
              onClick={() =>
                rightId != null && e.right_line != null && gotoLine(rightId, e.right_line)
              }
              title={e.right_line != null ? `right line ${e.right_line}` : "absent"}
            >
              {e.right ?? "—"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
