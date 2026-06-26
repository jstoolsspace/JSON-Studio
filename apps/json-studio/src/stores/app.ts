import { create } from "zustand";
import type {
  DocumentMetadata,
  OpenResult,
  ParseError,
  RecentEntry,
} from "@jstools/json-ui";
import { baseName } from "@jstools/json-ui";
import { closeDocument } from "../ipc/commands";
import { useSettings } from "./settings";

export type ViewMode = "tree" | "raw" | "query" | "diff" | "records";

export interface Tab {
  docId: number;
  name: string;
  path: string;
  metadata: DocumentMetadata;
  parseError: ParseError | null;
  viewMode: ViewMode;
  watching: boolean;
  modifiedOnDisk: boolean;
  autoReload: boolean;
  /// Bumped on reload to force the active view to remount and refetch.
  rev: number;
  /// True for in-memory (pasted/typed) documents that can be edited in place.
  scratch: boolean;
  /// Current text of a scratch document (for re-editing).
  scratchText: string;
}

interface AppState {
  tabs: Tab[];
  activeId: number | null;
  searchOpen: boolean;
  pasteOpen: boolean;
  /// When set, the paste dialog edits this existing scratch document.
  pasteEditId: number | null;
  /// Scratch tab pending a save/discard confirmation before closing.
  closingTab: number | null;
  /// True while the app-quit confirmation (unsaved scratch tabs) is showing.
  quitting: boolean;
  /// True while the keyboard-shortcuts help overlay is showing.
  helpOpen: boolean;
  /// Pending line to scroll the Raw view to (1-based), consumed by RawView.
  rawGoto: number | null;
  /// Pending tree node to reveal+scroll to, consumed by TreeView.
  treeReveal: { docId: number; nodeId: number; nonce: number } | null;
  queryHistory: Record<number, string[]>;
  recent: RecentEntry[];

  openTab: (result: OpenResult, scratchText?: string) => void;
  closeTab: (docId: number) => void;
  requestCloseTab: (docId: number) => void;
  setClosingTab: (docId: number | null) => void;
  setQuitting: (on: boolean) => void;
  toggleHelp: (on?: boolean) => void;
  setActive: (docId: number) => void;
  setViewMode: (docId: number, mode: ViewMode) => void;
  activeTab: () => Tab | undefined;
  markChanged: (docId: number) => void;
  dismissChanged: (docId: number) => void;
  applyReload: (result: OpenResult) => void;
  setAutoReload: (docId: number, on: boolean) => void;

  toggleSearch: (open?: boolean) => void;
  togglePaste: (open?: boolean, editId?: number | null) => void;
  markScratch: (docId: number, text: string) => void;
  gotoLine: (docId: number, line: number) => void;
  clearGoto: () => void;
  gotoNode: (docId: number, nodeId: number) => void;
  clearTreeReveal: () => void;
  pushQuery: (docId: number, expr: string) => void;
  setRecent: (recent: RecentEntry[]) => void;
  clearQueryHistory: () => void;
}

export const useApp = create<AppState>((set, get) => ({
  tabs: [],
  activeId: null,
  searchOpen: false,
  pasteOpen: false,
  pasteEditId: null,
  closingTab: null,
  quitting: false,
  helpOpen: false,
  rawGoto: null,
  treeReveal: null,
  queryHistory: {},
  recent: [],

  openTab: (result, scratchText) => {
    set((s) => {
      // If this path is already open, just focus it.
      const existing = s.tabs.find((t) => t.path === result.metadata.path);
      if (existing) {
        return { activeId: existing.docId };
      }
      const fmt = result.metadata.format;
      const st = useSettings.getState();
      const isScratch = scratchText !== undefined;
      const viewMode: ViewMode = result.parse_error
        ? "raw"
        : fmt === "jsonl" || fmt === "ndjson"
          ? "records"
          : st.defaultView;
      const tab: Tab = {
        docId: result.id,
        name: baseName(result.metadata.path),
        path: result.metadata.path,
        metadata: result.metadata,
        parseError: result.parse_error,
        viewMode,
        watching: !isScratch,
        modifiedOnDisk: false,
        autoReload: st.autoReload,
        rev: 0,
        scratch: isScratch,
        scratchText: scratchText ?? "",
      };
      return { tabs: [...s.tabs, tab], activeId: tab.docId };
    });
  },

  closeTab: (docId) => {
    void closeDocument(docId).catch(() => {});
    set((s) => {
      const tabs = s.tabs.filter((t) => t.docId !== docId);
      let activeId = s.activeId;
      if (activeId === docId) {
        const idx = s.tabs.findIndex((t) => t.docId === docId);
        const next = tabs[idx] ?? tabs[idx - 1] ?? tabs[0];
        activeId = next ? next.docId : null;
      }
      return { tabs, activeId };
    });
  },

  requestCloseTab: (docId) => {
    const tab = get().tabs.find((t) => t.docId === docId);
    if (tab && tab.scratch) {
      set({ closingTab: docId });
    } else {
      get().closeTab(docId);
    }
  },

  setClosingTab: (docId) => set({ closingTab: docId }),

  setQuitting: (on) => set({ quitting: on }),

  toggleHelp: (on) => set((s) => ({ helpOpen: on ?? !s.helpOpen })),

  setActive: (docId) => set({ activeId: docId }),

  setViewMode: (docId, mode) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, viewMode: mode } : t,
      ),
    })),

  activeTab: () => {
    const { tabs, activeId } = get();
    return tabs.find((t) => t.docId === activeId);
  },

  toggleSearch: (open) =>
    set((s) => ({ searchOpen: open ?? !s.searchOpen })),

  togglePaste: (open, editId = null) =>
    set((s) => ({ pasteOpen: open ?? !s.pasteOpen, pasteEditId: editId })),

  markScratch: (docId, text) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, scratch: true, scratchText: text } : t,
      ),
    })),

  gotoLine: (docId, line) => {
    set((s) => ({
      activeId: docId,
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, viewMode: "raw" } : t,
      ),
      rawGoto: line,
    }));
  },

  clearGoto: () => set({ rawGoto: null }),

  gotoNode: (docId, nodeId) => {
    set((s) => ({
      activeId: docId,
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, viewMode: "tree" } : t,
      ),
      treeReveal: { docId, nodeId, nonce: Date.now() },
    }));
  },

  clearTreeReveal: () => set({ treeReveal: null }),

  pushQuery: (docId, expr) =>
    set((s) => {
      const prev = s.queryHistory[docId] ?? [];
      const next = [expr, ...prev.filter((e) => e !== expr)].slice(0, 25);
      return { queryHistory: { ...s.queryHistory, [docId]: next } };
    }),

  setRecent: (recent) => set({ recent }),

  clearQueryHistory: () => set({ queryHistory: {} }),

  markChanged: (docId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, modifiedOnDisk: true } : t,
      ),
    })),

  dismissChanged: (docId) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, modifiedOnDisk: false } : t,
      ),
    })),

  applyReload: (result) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.docId === result.id
          ? {
              ...t,
              metadata: result.metadata,
              parseError: result.parse_error,
              modifiedOnDisk: false,
              rev: t.rev + 1,
            }
          : t,
      ),
    })),

  setAutoReload: (docId, on) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.docId === docId ? { ...t, autoReload: on } : t,
      ),
    })),
}));
