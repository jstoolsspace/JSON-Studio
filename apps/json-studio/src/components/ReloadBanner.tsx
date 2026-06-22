import { RotateCw, X } from "lucide-react";
import { useApp } from "../stores/app";
import { reloadDoc } from "../ipc/openFile";

export function ReloadBanner() {
  const tab = useApp((s) => s.activeTab());
  const setAutoReload = useApp((s) => s.setAutoReload);
  const dismissChanged = useApp((s) => s.dismissChanged);
  if (!tab || !tab.modifiedOnDisk) return null;

  return (
    <div className="reload-banner">
      <RotateCw size={14} />
      <span>This file changed on disk.</span>
      <button className="btn primary" onClick={() => void reloadDoc(tab.docId)}>
        Reload
      </button>
      <label className="reload-auto">
        <input
          type="checkbox"
          checked={tab.autoReload}
          onChange={(e) => setAutoReload(tab.docId, e.target.checked)}
        />
        Auto-reload
      </label>
      <button
        className="btn icon"
        aria-label="Dismiss"
        onClick={() => dismissChanged(tab.docId)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
