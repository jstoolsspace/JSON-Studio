import { useApp } from "../stores/app";
import { formatBytes } from "@jstools/json-ui";

export function StatusBar() {
  const active = useApp((s) => s.activeTab());
  if (!active) {
    return (
      <div className="statusbar">
        <span>Ready</span>
      </div>
    );
  }
  const m = active.metadata;
  return (
    <div className="statusbar">
      <span>{m.format.toUpperCase()}</span>
      <span>{formatBytes(m.size_bytes)}</span>
      <span>{m.encoding}</span>
      <span>{m.line_count.toLocaleString()} lines</span>
      {m.node_count > 0 && <span>{m.node_count.toLocaleString()} nodes</span>}
      {active.parseError && (
        <span className="err">
          Parse error at line {active.parseError.line}:{active.parseError.column}
        </span>
      )}
      <span style={{ marginLeft: "auto" }} title={m.path}>
        {m.path}
      </span>
    </div>
  );
}
