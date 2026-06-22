import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  openDocument,
  openText,
  recentAdd,
  recentList,
  reloadDocument,
  saveText,
  sessionLoad,
  sessionSave,
} from "./commands";
import { useApp } from "../stores/app";

let pasteCounter = 0;

/** Size (in characters) above which in-editor scratch content is discouraged. */
export const LARGE_SCRATCH_CHARS = 2_000_000;

const FILTERS = [
  { name: "JSON", extensions: ["json", "jsonl", "ndjson"] },
  { name: "All files", extensions: ["*"] },
];

/** Show the system file picker and open the chosen file(s). */
export async function pickAndOpen(): Promise<void> {
  const selected = await openDialog({ multiple: true, filters: FILTERS });
  if (!selected) return;
  const paths = Array.isArray(selected) ? selected : [selected];
  for (const path of paths) {
    await openPath(path);
  }
}

/** Open a known path (used by drag-and-drop and the picker). */
export async function openPath(path: string, silent = false): Promise<void> {
  try {
    const result = await openDocument(path);
    useApp.getState().openTab(result);
    try {
      const recent = await recentAdd(result.metadata.path);
      useApp.getState().setRecent(recent);
    } catch {
      /* recent-files persistence is best-effort */
    }
  } catch (e) {
    console.error(`Failed to open ${path}:`, e);
    if (!silent) alert(`Could not open ${path}\n\n${String(e)}`);
  }
}

/** Open a document from pasted/typed text (not file-backed). */
export async function openTextDoc(text: string, name?: string): Promise<void> {
  try {
    pasteCounter += 1;
    const docName = name?.trim() || `pasted-${pasteCounter}.json`;
    const result = await openText(docName, text);
    useApp.getState().openTab(result, text);
  } catch (e) {
    console.error("Failed to open pasted text:", e);
    alert(`Could not open pasted JSON\n\n${String(e)}`);
  }
}

/**
 * Save text to a file chosen by the user. If `replaceDocId` is given (a scratch
 * tab), that tab is closed and the saved file is reopened as a file-backed
 * document (memory-mapped, no DOM load). Returns true if saved.
 */
export async function saveTextToFile(
  text: string,
  suggestedName: string,
  replaceDocId?: number,
  reopen = true,
): Promise<boolean> {
  const path = await saveDialog({
    defaultPath: suggestedName,
    filters: [{ name: "JSON", extensions: ["json", "jsonl", "ndjson"] }],
  });
  if (!path) return false;
  try {
    await saveText(path, text);
  } catch (e) {
    alert(`Could not save file\n\n${String(e)}`);
    return false;
  }
  if (replaceDocId != null) useApp.getState().closeTab(replaceDocId);
  if (reopen) await openPath(path);
  return true;
}

/** Restore previously-open file-backed tabs (called once on startup). */
export async function restoreSession(): Promise<void> {
  try {
    const data = (await sessionLoad()) as
      | { paths?: string[]; active?: string | null }
      | null;
    if (!data?.paths?.length) return;
    for (const p of data.paths) {
      await openPath(p, true); // silent: ignore files that moved/disappeared
    }
    if (data.active) {
      const tab = useApp.getState().tabs.find((t) => t.path === data.active);
      if (tab) useApp.getState().setActive(tab.docId);
    }
  } catch {
    /* ignore */
  }
}

/** Persist the current set of file-backed tabs (scratch tabs are skipped). */
export function persistSession(): void {
  const st = useApp.getState();
  const paths = st.tabs.filter((t) => !t.scratch).map((t) => t.path);
  const active = st.activeTab()?.path ?? null;
  void sessionSave({ paths, active });
}

/** Reload a file-backed document from disk and refresh its tab. */
export async function reloadDoc(id: number): Promise<void> {
  try {
    const result = await reloadDocument(id);
    useApp.getState().applyReload(result);
  } catch (e) {
    console.error(`Failed to reload ${id}:`, e);
  }
}

/** Load the recent-files list into the store (called on startup). */
export async function loadRecent(): Promise<void> {
  try {
    useApp.getState().setRecent(await recentList());
  } catch {
    /* ignore */
  }
}
