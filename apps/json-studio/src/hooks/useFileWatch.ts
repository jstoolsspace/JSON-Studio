import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "../stores/app";
import { reloadDoc } from "../ipc/openFile";

/**
 * Listen for backend `document-changed` events. Auto-reloads tabs that opted in;
 * otherwise marks the tab as changed-on-disk so a reload prompt can appear.
 */
export function useFileWatch() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let active = true;

    listen<number>("document-changed", (event) => {
      const id = event.payload;
      const tab = useApp.getState().tabs.find((t) => t.docId === id);
      if (!tab) return;
      if (tab.autoReload) {
        void reloadDoc(id);
      } else {
        useApp.getState().markChanged(id);
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
