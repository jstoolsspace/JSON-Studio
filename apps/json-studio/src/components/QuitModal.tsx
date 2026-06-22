import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp } from "../stores/app";
import { saveTextToFile } from "../ipc/openFile";

export function QuitModal() {
  const quitting = useApp((s) => s.quitting);
  const setQuitting = useApp((s) => s.setQuitting);
  // Select a primitive count — returning a new array from a selector would loop.
  const count = useApp((s) => s.tabs.reduce((n, t) => (t.scratch ? n + 1 : n), 0));

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setQuitting(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [setQuitting]);

  if (!quitting) return null;

  async function saveAllAndQuit() {
    // Save each unsaved scratch tab; abort if the user cancels a save dialog.
    for (const t of useApp.getState().tabs.filter((x) => x.scratch)) {
      const ok = await saveTextToFile(t.scratchText, t.name, undefined, false);
      if (!ok) {
        setQuitting(false);
        return;
      }
    }
    await getCurrentWindow().destroy();
  }

  function quitWithoutSaving() {
    void getCurrentWindow().destroy();
  }

  return (
    <div className="overlay" onMouseDown={() => setQuitting(false)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quit with unsaved tabs"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">Quit JSON Studio?</div>
        <div className="modal-body">
          You have {count} pasted {count === 1 ? "tab" : "tabs"} that{" "}
          {count === 1 ? "isn't" : "aren't"} saved to a file. Save{" "}
          {count === 1 ? "it" : "them"} before quitting?
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setQuitting(false)}>
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={quitWithoutSaving}>
            Quit without saving
          </button>
          <button className="btn primary" onClick={() => void saveAllAndQuit()}>
            Save{count > 1 ? " all" : ""}…
          </button>
        </div>
      </div>
    </div>
  );
}
