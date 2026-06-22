import { useEffect } from "react";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "General",
    items: [
      ["⌘/Ctrl + O", "Open file"],
      ["⌘/Ctrl + F", "Search"],
      ["⌘/Ctrl + W", "Close active tab"],
      ["⌘/Ctrl + Shift + D", "Diff view"],
      ["Esc", "Close menu / panel / dialog"],
      ["?", "Show this help"],
    ],
  },
  {
    title: "Tree",
    items: [
      ["↑ / ↓", "Move selection"],
      ["→", "Expand, or go to first child"],
      ["←", "Collapse, or go to parent"],
      ["Enter / Space", "Toggle expand"],
      ["Home / End", "First / last node"],
    ],
  },
  {
    title: "Query",
    items: [["⌘/Ctrl + Enter", "Run query"]],
  },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">Keyboard shortcuts</div>
        {GROUPS.map((g) => (
          <div key={g.title} className="shortcuts-group">
            <div className="shortcuts-heading">{g.title}</div>
            {g.items.map(([keys, desc]) => (
              <div key={desc} className="shortcuts-row">
                <kbd className="kbd">{keys}</kbd>
                <span>{desc}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
