import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { openPath } from "../ipc/openFile";

/**
 * Listen for the Tauri window drag-and-drop event and open dropped files.
 * Returns whether a drag is currently hovering the window (for visual feedback).
 */
export function useDragDrop(): boolean {
  const [over, setOver] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === "over" || type === "enter") {
          setOver(true);
        } else if (type === "drop") {
          setOver(false);
          const paths = (event.payload as { paths?: string[] }).paths ?? [];
          for (const p of paths) void openPath(p);
        } else {
          setOver(false);
        }
      })
      .then((fn) => {
        if (active) unlisten = fn;
        else fn();
      })
      .catch(() => {});

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return over;
}
