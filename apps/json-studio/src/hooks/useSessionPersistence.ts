import { useEffect } from "react";
import { useApp } from "../stores/app";
import { persistSession } from "../ipc/openFile";

/**
 * Persist the set of open file-backed tabs (and the active one) whenever tabs
 * change, debounced. Restored on next launch.
 */
export function useSessionPersistence() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => persistSession(), 300);
    };
    const unsub = useApp.subscribe((state, prev) => {
      if (state.tabs !== prev.tabs || state.activeId !== prev.activeId) {
        schedule();
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);
}
