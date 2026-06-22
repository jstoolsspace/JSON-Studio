import { useEffect } from "react";
import { useApp } from "../stores/app";
import { saveTextToFile } from "../ipc/openFile";

export function ConfirmCloseModal() {
  const docId = useApp((s) => s.closingTab);
  const tab = useApp((s) =>
    docId != null ? s.tabs.find((t) => t.docId === docId) : undefined,
  );
  const closeTab = useApp((s) => s.closeTab);
  const setClosingTab = useApp((s) => s.setClosingTab);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setClosingTab(null);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [setClosingTab]);

  if (docId == null || !tab) return null;

  async function save() {
    if (!tab) return;
    const saved = await saveTextToFile(tab.scratchText, tab.name, undefined, false);
    if (saved) {
      closeTab(tab.docId);
      setClosingTab(null);
    }
    // If the save dialog was cancelled, keep the tab and this prompt open.
  }

  function discard() {
    closeTab(tab!.docId);
    setClosingTab(null);
  }

  return (
    <div className="overlay" onMouseDown={() => setClosingTab(null)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Close unsaved document"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">Close {tab.name}?</div>
        <div className="modal-body">
          This tab contains pasted JSON that isn't saved to a file. Save it before
          closing?
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={() => setClosingTab(null)}>
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={discard}>
            Don't save
          </button>
          <button className="btn primary" onClick={() => void save()}>
            Save…
          </button>
        </div>
      </div>
    </div>
  );
}
