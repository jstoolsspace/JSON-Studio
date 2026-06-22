import { useEffect } from "react";

export interface InfoContent {
  title: string;
  body: string;
}

export function InfoModal({
  content,
  onClose,
}: {
  content: InfoContent;
  onClose: () => void;
}) {
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
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">{content.title}</div>
        <div className="modal-body">{content.body}</div>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
