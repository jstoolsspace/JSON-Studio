import { useEffect } from "react";
import { Toolbar } from "./components/Toolbar";
import { Tabs } from "./components/Tabs";
import { ViewSwitcher } from "./components/ViewSwitcher";
import { StatusBar } from "./components/StatusBar";
import { TreeView } from "./views/TreeView";
import { RawView } from "./views/RawView";
import { QueryView } from "./views/QueryView";
import { DiffView } from "./views/DiffView";
import { JsonlView } from "./views/JsonlView";
import { SearchPanel } from "./components/SearchPanel";
import { RecentList } from "./components/RecentList";
import { PasteModal } from "./components/PasteModal";
import { ReloadBanner } from "./components/ReloadBanner";
import { ConfirmCloseModal } from "./components/ConfirmCloseModal";
import { QuitModal } from "./components/QuitModal";
import { ShortcutsModal } from "./components/ShortcutsModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useApp } from "./stores/app";
import { useDragDrop } from "./hooks/useDragDrop";
import { useFileWatch } from "./hooks/useFileWatch";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useCloseGuard } from "./hooks/useCloseGuard";
import { pickAndOpen, loadRecent, restoreSession } from "./ipc/openFile";

export function App() {
  const active = useApp((s) => s.activeTab());
  const requestCloseTab = useApp((s) => s.requestCloseTab);
  const setViewMode = useApp((s) => s.setViewMode);
  const searchOpen = useApp((s) => s.searchOpen);
  const toggleSearch = useApp((s) => s.toggleSearch);
  const pasteOpen = useApp((s) => s.pasteOpen);
  const helpOpen = useApp((s) => s.helpOpen);
  const toggleHelp = useApp((s) => s.toggleHelp);
  const dragOver = useDragDrop();
  useFileWatch();
  useSessionPersistence();
  useCloseGuard();

  useEffect(() => {
    void loadRecent();
    void restoreSession();
  }, []);

  // Suppress the native WebView context menu, except in text fields where the
  // OS paste/copy menu is useful. Our own tree menu still works.
  useEffect(() => {
    function onCtx(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
    }
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // Global shortcuts (Phase 14 finalizes the full map + conflict audit).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "?" && !typing) {
        e.preventDefault();
        toggleHelp(true);
        return;
      }
      if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        void pickAndOpen();
      } else if (mod && e.key.toLowerCase() === "f" && active) {
        e.preventDefault();
        toggleSearch(true);
      } else if (mod && e.key.toLowerCase() === "w" && active) {
        e.preventDefault();
        requestCloseTab(active.docId);
      } else if (mod && e.shiftKey && e.key.toLowerCase() === "d" && active) {
        e.preventDefault();
        setViewMode(active.docId, "diff");
      } else if (e.key === "Escape" && searchOpen) {
        toggleSearch(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, requestCloseTab, setViewMode, toggleSearch, searchOpen, toggleHelp]);

  return (
    <div className={`app${dragOver ? " dragover" : ""}`}>
      <Toolbar />
      <Tabs />
      {active && <ViewSwitcher />}
      <main className="main">
        {active && <ReloadBanner />}
        {!active ? (
          <EmptyState />
        ) : (
          <ErrorBoundary key={`${active.docId}:${active.viewMode}:${active.rev}`}>
            <ActiveView />
          </ErrorBoundary>
        )}
        {searchOpen && active && <SearchPanel key={active.docId} tab={active} />}
      </main>
      <StatusBar />
      {pasteOpen && <PasteModal />}
      <ConfirmCloseModal />
      <QuitModal />
      {helpOpen && <ShortcutsModal onClose={() => toggleHelp(false)} />}
    </div>
  );
}

function ActiveView() {
  const active = useApp((s) => s.activeTab())!;
  switch (active.viewMode) {
    case "tree":
      return <TreeView tab={active} />;
    case "raw":
      return <RawView tab={active} />;
    case "query":
      return <QueryView />;
    case "diff":
      return <DiffView />;
    case "records":
      return <JsonlView tab={active} />;
    default:
      return null;
  }
}

function EmptyState() {
  return (
    <div className="empty">
      <div className="drop">
        <div style={{ fontSize: 15, marginBottom: 8 }}>JSON Studio</div>
        <div style={{ marginBottom: 16 }}>
          Drag a <code>.json</code>, <code>.jsonl</code> or{" "}
          <code>.ndjson</code> file here
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="btn primary" onClick={() => void pickAndOpen()}>
            Open file…
          </button>
          <button
            className="btn"
            onClick={() => useApp.getState().togglePaste(true)}
          >
            Paste JSON…
          </button>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
          or press ⌘/Ctrl + O · press ? for shortcuts
        </div>
      </div>
      <RecentList />
    </div>
  );
}
