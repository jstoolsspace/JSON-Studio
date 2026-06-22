import { useState } from "react";
import {
  FilePlus,
  FolderOpen,
  HelpCircle,
  Moon,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useApp } from "../stores/app";
import { useSettings } from "../stores/settings";
import { pickAndOpen } from "../ipc/openFile";
import { Logo } from "./Logo";
import { SettingsModal } from "./SettingsModal";

export function Toolbar() {
  const theme = useSettings((s) => s.theme);
  const setSettings = useSettings((s) => s.set);
  const toggleSearch = useApp((s) => s.toggleSearch);
  const togglePaste = useApp((s) => s.togglePaste);
  const toggleHelp = useApp((s) => s.toggleHelp);
  const hasActive = useApp((s) => s.activeId != null);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="toolbar">
      <div className="logo">
        <Logo size={18} />
        <span>
          JSTools <strong>JSON Studio</strong>
        </span>
      </div>

      <button className="btn" onClick={() => void pickAndOpen()} title="Open file (⌘/Ctrl+O)">
        <FolderOpen size={14} /> Open
      </button>
      <button
        className="btn"
        onClick={() => togglePaste(true)}
        title="New tab — paste/type JSON"
      >
        <FilePlus size={14} /> New tab
      </button>
      <button
        className="btn"
        onClick={() => toggleSearch(true)}
        disabled={!hasActive}
        title="Search (⌘/Ctrl+F)"
      >
        <Search size={14} /> Search
      </button>

      <div className="spacer" />

      <button
        className="btn icon"
        title="Toggle theme"
        aria-label="Toggle theme"
        onClick={() => setSettings({ theme: theme === "dark" ? "light" : "dark" })}
      >
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </button>
      <button
        className="btn icon"
        title="Keyboard shortcuts (?)"
        aria-label="Keyboard shortcuts"
        onClick={() => toggleHelp(true)}
      >
        <HelpCircle size={15} />
      </button>
      <button
        className="btn icon"
        title="Settings"
        aria-label="Settings"
        onClick={() => setShowSettings(true)}
      >
        <Settings size={15} />
      </button>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
