import type { ViewMode } from "../stores/app";
import { useApp } from "../stores/app";
import { saveTextToFile } from "../ipc/openFile";

const JSON_MODES: { id: ViewMode; label: string }[] = [
  { id: "tree", label: "Tree" },
  { id: "raw", label: "Raw" },
  { id: "query", label: "Query" },
  { id: "diff", label: "Diff" },
];

const JSONL_MODES: { id: ViewMode; label: string }[] = [
  { id: "records", label: "Records" },
  { id: "raw", label: "Raw" },
  { id: "diff", label: "Diff" },
];

export function ViewSwitcher() {
  const active = useApp((s) => s.activeTab());
  const setViewMode = useApp((s) => s.setViewMode);
  const togglePaste = useApp((s) => s.togglePaste);
  if (!active) return null;
  const isJsonl = active.metadata.format !== "json";
  const MODES = isJsonl ? JSONL_MODES : JSON_MODES;

  return (
    <div className="viewbar">
      <div className="seg" role="tablist" aria-label="View mode">
        {MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={active.viewMode === m.id}
            className={active.viewMode === m.id ? "active" : ""}
            title={m.label}
            onClick={() => setViewMode(active.docId, m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      {active.scratch && (
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            className="btn"
            title="Edit this pasted document"
            onClick={() => togglePaste(true, active.docId)}
          >
            Edit content
          </button>
          <button
            className="btn"
            title="Save this document to a file"
            onClick={() =>
              void saveTextToFile(active.scratchText, active.name, active.docId)
            }
          >
            Save as…
          </button>
        </div>
      )}
    </div>
  );
}
