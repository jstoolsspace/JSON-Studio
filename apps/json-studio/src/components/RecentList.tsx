import { Pin, PinOff, X } from "lucide-react";
import { useApp } from "../stores/app";
import { useSettings } from "../stores/settings";
import { openPath } from "../ipc/openFile";
import { recentRemove, recentTogglePin } from "../ipc/commands";

export function RecentList() {
  const recent = useApp((s) => s.recent);
  const setRecent = useApp((s) => s.setRecent);
  const limit = useSettings((s) => s.recentLimit);

  if (recent.length === 0) return null;

  return (
    <div className="recent">
      <div className="recent-title">Recent</div>
      {recent.slice(0, limit).map((r) => (
        <div className="recent-item" key={r.path}>
          <button
            className="recent-open"
            title={r.path}
            onClick={() => void openPath(r.path)}
          >
            <span className="recent-name">{r.name}</span>
            <span className="recent-path">{r.path}</span>
          </button>
          <button
            className="btn icon"
            aria-label={r.pinned ? "Unpin" : "Pin"}
            title={r.pinned ? "Unpin" : "Pin"}
            onClick={() => void recentTogglePin(r.path).then(setRecent)}
          >
            {r.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button
            className="btn icon"
            aria-label="Remove from recent"
            onClick={() => void recentRemove(r.path).then(setRecent)}
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
