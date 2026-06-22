import { useEffect, useRef, useState } from "react";
import { useApp } from "../stores/app";
import { LARGE_SCRATCH_CHARS, openTextDoc, saveTextToFile } from "../ipc/openFile";
import { updateText } from "../ipc/commands";

export function PasteModal() {
  const togglePaste = useApp((s) => s.togglePaste);
  const editId = useApp((s) => s.pasteEditId);
  const applyReload = useApp((s) => s.applyReload);
  const markScratch = useApp((s) => s.markScratch);
  const editTab = useApp((s) =>
    editId != null ? s.tabs.find((t) => t.docId === editId) : undefined,
  );

  const [text, setText] = useState(editTab?.scratchText ?? "");
  const [name, setName] = useState("");
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const isEdit = editId != null;

  useEffect(() => {
    areaRef.current?.focus();
    // Prefill from clipboard only for a fresh tab.
    if (!isEdit) {
      navigator.clipboard
        ?.readText()
        .then((t) => {
          const s = t?.trim();
          if (s && (s.startsWith("{") || s.startsWith("["))) setText(t);
        })
        .catch(() => {});
    }
  }, [isEdit]);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") togglePaste(false);
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [togglePaste]);

  const tooLarge = text.length > LARGE_SCRATCH_CHARS;

  async function saveToFile() {
    const ok = await saveTextToFile(
      text,
      name.trim() || editTab?.name || "document.json",
      isEdit ? (editId ?? undefined) : undefined,
    );
    if (ok) togglePaste(false);
  }

  async function submit() {
    if (!text.trim()) return;
    if (isEdit && editId != null) {
      try {
        const result = await updateText(editId, text);
        applyReload(result);
        markScratch(editId, text);
      } catch (e) {
        alert(`Could not update document\n\n${String(e)}`);
        return;
      }
    } else {
      void openTextDoc(text, name);
    }
    togglePaste(false);
  }

  return (
    <div className="overlay" onMouseDown={() => togglePaste(false)}>
      <div
        className="modal paste-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Edit JSON" : "New tab from JSON"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">
          {isEdit ? `Edit ${editTab?.name ?? "document"}` : "New tab — paste JSON"}
        </div>
        {!isEdit && (
          <input
            className="search-input"
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="Name (optional), e.g. response.json"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <textarea
          ref={areaRef}
          className="paste-area"
          spellCheck={false}
          placeholder="Paste or type JSON / JSONL here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {tooLarge && (
          <div className="paste-warning">
            This is a large amount of text (
            {(text.length / 1_000_000).toFixed(1)} M chars). Keeping it in the
            in-app editor is heavy for the UI — save it to a file and it will
            reopen memory-mapped, with no editor load.
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={() => togglePaste(false)}>
            Cancel
          </button>
          <div style={{ flex: 1 }} />
          <button
            className={`btn${tooLarge ? " primary" : ""}`}
            onClick={() => void saveToFile()}
            disabled={!text.trim()}
            title="Save to a file and open it memory-mapped"
          >
            Save to file…
          </button>
          <button
            className={`btn${tooLarge ? "" : " primary"}`}
            onClick={() => void submit()}
            disabled={!text.trim()}
          >
            {isEdit ? "Apply" : "Open in tab"}
          </button>
        </div>
      </div>
    </div>
  );
}
