import { create } from "zustand";
import { settingsLoad, settingsSave, setQueryLimit } from "../ipc/commands";

export type ThemeMode = "system" | "light" | "dark";
export type DefaultView = "tree" | "raw";

export interface Settings {
  theme: ThemeMode;
  /** Monospace font size (px) for Tree / Raw / results. */
  fontSize: number;
  /** Line height (unitless) for the Raw view. */
  lineHeight: number;
  /** Indent width (px) per tree level. */
  indentWidth: number;
  /** Default word-wrap state in the Raw view. */
  wordWrap: boolean;
  /** Default view for newly opened JSON documents. */
  defaultView: DefaultView;
  /** Tree depth expanded on open (1 = root only). */
  collapseDepth: number;
  /** Max recent files shown. */
  recentLimit: number;
  /** Max search results. */
  searchLimit: number;
  /** In-memory cap (MB) for query/diff. */
  queryLimitMb: number;
  /** Default auto-reload for newly opened documents. */
  autoReload: boolean;
}

export const DEFAULTS: Settings = {
  theme: "dark",
  fontSize: 13,
  lineHeight: 1.5,
  indentWidth: 14,
  wordWrap: false,
  defaultView: "tree",
  collapseDepth: 2,
  recentLimit: 30,
  searchLimit: 1000,
  queryLimitMb: 64,
  autoReload: false,
};

interface SettingsState extends Settings {
  loaded: boolean;
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
  load: () => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  set: (patch) => {
    set(patch);
    const s = get();
    applySettings(s);
    void persist(s);
  },

  reset: () => {
    set({ ...DEFAULTS });
    applySettings(get());
    void persist(get());
  },

  load: async () => {
    try {
      const stored = (await settingsLoad()) as Partial<Settings> | null;
      if (stored) set({ ...stored });
    } catch {
      /* ignore — fall back to defaults */
    }
    set({ loaded: true });
    applySettings(get());
  },
}));

function persist(s: Settings) {
  const payload: Settings = {
    theme: s.theme,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    indentWidth: s.indentWidth,
    wordWrap: s.wordWrap,
    defaultView: s.defaultView,
    collapseDepth: s.collapseDepth,
    recentLimit: s.recentLimit,
    searchLimit: s.searchLimit,
    queryLimitMb: s.queryLimitMb,
    autoReload: s.autoReload,
  };
  return Promise.all([
    settingsSave(payload as unknown as Record<string, unknown>),
    setQueryLimit(Math.max(1, s.queryLimitMb) * 1024 * 1024),
  ]).catch(() => {});
}

export function applyTheme(theme: ThemeMode) {
  const root = document.documentElement;
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", dark ? "dark" : "light");
  } else {
    root.setAttribute("data-theme", theme);
  }
}

export function applySettings(s: Settings) {
  applyTheme(s.theme);
  const root = document.documentElement;
  root.style.setProperty("--mono-fs", `${s.fontSize}px`);
  root.style.setProperty("--mono-lh", String(s.lineHeight));
}
