import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useApp } from "../stores/app";

/**
 * Intercept the window close request. If there are unsaved scratch (pasted)
 * tabs, cancel the close and show the quit-confirm dialog instead.
 */
export function useCloseGuard() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    getCurrentWindow()
      .onCloseRequested((event) => {
        const hasUnsaved = useApp.getState().tabs.some((t) => t.scratch);
        if (hasUnsaved) {
          event.preventDefault();
          useApp.getState().setQuitting(true);
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
}
