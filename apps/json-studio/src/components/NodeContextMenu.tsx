import { useEffect, useRef } from "react";
import type { JsonNode } from "@jstools/json-ui";

export interface MenuState {
  x: number;
  y: number;
  node: JsonNode;
}

const ITEMS: { id: string; label: string; sep?: boolean; disabled?: boolean }[] = [
  { id: "value", label: "Copy value" },
  { id: "key", label: "Copy key" },
  { id: "object", label: "Copy object" },
  { id: "raw", label: "Copy raw value" },
  { id: "path", label: "Copy JSONPath", sep: true },
  { id: "pointer", label: "Copy JSON Pointer" },
  { id: "expand-subtree", label: "Expand subtree", sep: true },
  { id: "collapse-subtree", label: "Collapse subtree" },
  { id: "compare-subtree", label: "Compare subtree (Session C)", disabled: true },
];

export function NodeContextMenu({
  state,
  onAction,
  onClose,
}: {
  state: MenuState;
  onAction: (action: string, node: JsonNode) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  // Keep the menu inside the viewport.
  const x = Math.min(state.x, window.innerWidth - 220);
  const y = Math.min(state.y, window.innerHeight - 280);

  return (
    <div className="menu" ref={ref} style={{ left: x, top: y }} role="menu">
      {ITEMS.map((it) => (
        <div key={it.id}>
          {it.sep && <div className="sep" />}
          <button
            role="menuitem"
            disabled={it.disabled}
            style={it.disabled ? { opacity: 0.4 } : undefined}
            onClick={() => !it.disabled && onAction(it.id, state.node)}
          >
            {it.label}
          </button>
        </div>
      ))}
    </div>
  );
}
