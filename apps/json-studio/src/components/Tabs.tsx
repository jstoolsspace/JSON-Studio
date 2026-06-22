import { Eye, X } from "lucide-react";
import { useApp } from "../stores/app";
import { formatBytes } from "@jstools/json-ui";

export function Tabs() {
  const tabs = useApp((s) => s.tabs);
  const activeId = useApp((s) => s.activeId);
  const setActive = useApp((s) => s.setActive);
  const requestCloseTab = useApp((s) => s.requestCloseTab);

  if (tabs.length === 0) return <div className="tabs" />;

  return (
    <div className="tabs" role="tablist" aria-label="Open documents">
      {tabs.map((t) => (
        <div
          key={t.docId}
          role="tab"
          aria-selected={t.docId === activeId}
          tabIndex={0}
          className={`tab${t.docId === activeId ? " active" : ""}`}
          onClick={() => setActive(t.docId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setActive(t.docId);
          }}
          title={t.path}
        >
          {t.modifiedOnDisk && <span className="dot" title="Changed on disk" />}
          {t.watching && <Eye size={11} aria-label="watching" />}
          <span className="tab-name">{t.name}</span>
          <span className="size">{formatBytes(t.metadata.size_bytes)}</span>
          <button
            className="close"
            aria-label={`Close ${t.name}`}
            onClick={(e) => {
              e.stopPropagation();
              requestCloseTab(t.docId);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
