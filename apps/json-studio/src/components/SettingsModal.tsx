import { useEffect, type ReactNode } from "react";
import { useApp } from "../stores/app";
import { useSettings, type DefaultView, type ThemeMode } from "../stores/settings";
import { recentClear } from "../ipc/commands";

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const setRecent = useApp((a) => a.setRecent);
  const clearQueryHistory = useApp((a) => a.clearQueryHistory);

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  async function clearHistory() {
    try {
      await recentClear();
      setRecent([]);
    } catch {
      /* ignore */
    }
    clearQueryHistory();
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-title">Settings</div>

        <div className="settings-grid">
          <Row label="Theme">
            <Seg
              value={s.theme}
              options={["system", "light", "dark"] as ThemeMode[]}
              onChange={(v) => s.set({ theme: v })}
            />
          </Row>
          <Row label="Default view (JSON)">
            <Seg
              value={s.defaultView}
              options={["tree", "raw"] as DefaultView[]}
              onChange={(v) => s.set({ defaultView: v })}
            />
          </Row>
          <Row label="Font size (px)">
            <Num value={s.fontSize} min={10} max={22} onChange={(v) => s.set({ fontSize: v })} />
          </Row>
          <Row label="Line height">
            <Num
              value={s.lineHeight}
              min={1.1}
              max={2.2}
              step={0.1}
              onChange={(v) => s.set({ lineHeight: v })}
            />
          </Row>
          <Row label="Indent width (px)">
            <Num value={s.indentWidth} min={8} max={32} onChange={(v) => s.set({ indentWidth: v })} />
          </Row>
          <Row label="Word wrap (Raw)">
            <Check checked={s.wordWrap} onChange={(v) => s.set({ wordWrap: v })} />
          </Row>
          <Row label="Expand depth on open">
            <Num value={s.collapseDepth} min={1} max={12} onChange={(v) => s.set({ collapseDepth: v })} />
          </Row>
          <Row label="Recent files limit">
            <Num value={s.recentLimit} min={5} max={100} onChange={(v) => s.set({ recentLimit: v })} />
          </Row>
          <Row label="Search results limit">
            <Num
              value={s.searchLimit}
              min={100}
              max={20000}
              step={100}
              onChange={(v) => s.set({ searchLimit: v })}
            />
          </Row>
          <Row label="Query / Diff memory (MB)">
            <Num
              value={s.queryLimitMb}
              min={8}
              max={2048}
              step={8}
              onChange={(v) => s.set({ queryLimitMb: v })}
            />
          </Row>
          <Row label="Auto-reload new tabs">
            <Check checked={s.autoReload} onChange={(v) => s.set({ autoReload: v })} />
          </Row>
        </div>

        <div className="settings-actions">
          <button className="btn" onClick={() => void clearHistory()}>
            Clear local history
          </button>
          <button className="btn" onClick={() => s.reset()}>
            Reset to defaults
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <label className="settings-label">{label}</label>
      <div className="settings-control">{children}</div>
    </>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o}
          className={value === o ? "active" : ""}
          onClick={() => onChange(o)}
          style={{ textTransform: "capitalize" }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Num({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      className="settings-num"
      value={value}
      min={min}
      max={max}
      step={step ?? 1}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
      }}
    />
  );
}

function Check({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  );
}
