import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { WrapText } from "lucide-react";
import type { Tab } from "../stores/app";
import { useApp } from "../stores/app";
import { useSettings } from "../stores/settings";
import { useWindowedRows } from "../hooks/useWindowedRows";
import { getRawLines } from "../ipc/commands";

export function RawView({ tab }: { tab: Tab }) {
  const docId = tab.docId;
  const parentRef = useRef<HTMLDivElement>(null);
  const defaultWrap = useSettings((s) => s.wordWrap);
  const [wrap, setWrap] = useState(defaultWrap);
  const [gotoValue, setGotoValue] = useState("");

  const { total, get, ensureRange } = useWindowedRows<string>(
    async (offset, limit) => {
      const w = await getRawLines(docId, offset, limit);
      return { rows: w.lines, total: w.total_lines };
    },
    [docId],
  );

  const virtualizer = useVirtualizer({
    count: total.current,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 30,
  });

  const items = virtualizer.getVirtualItems();
  const firstIndex = items.length > 0 ? items[0]!.index : 0;
  const lastIndex = items.length > 0 ? items[items.length - 1]!.index : 0;
  useEffect(() => {
    if (total.current > 0) ensureRange(firstIndex, lastIndex);
  }, [firstIndex, lastIndex, ensureRange, total]);

  // Consume a pending "jump to line" request (from search results).
  const rawGoto = useApp((s) => s.rawGoto);
  const clearGoto = useApp((s) => s.clearGoto);
  const totalCount = total.current;
  useEffect(() => {
    if (rawGoto != null && totalCount > 0) {
      virtualizer.scrollToIndex(Math.min(rawGoto - 1, totalCount - 1), {
        align: "center",
      });
      clearGoto();
    }
  }, [rawGoto, totalCount, clearGoto, virtualizer]);

  function goToLine() {
    const n = parseInt(gotoValue, 10);
    if (!Number.isFinite(n) || n < 1) return;
    virtualizer.scrollToIndex(Math.min(n - 1, total.current - 1), { align: "start" });
  }

  const gutterWidth = Math.max(48, String(total.current).length * 9 + 24);

  return (
    <>
      <div className="viewbar" style={{ paddingTop: 0 }}>
        <button
          className={`btn${wrap ? " primary" : ""}`}
          onClick={() => setWrap((w) => !w)}
          title="Toggle word wrap"
        >
          <WrapText size={14} /> Wrap
        </button>
        <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input
            aria-label="Go to line"
            placeholder="Go to line"
            value={gotoValue}
            onChange={(e) => setGotoValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToLine()}
            style={{
              width: 90,
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              color: "var(--fg)",
              padding: "2px 6px",
              fontSize: "var(--fs-sm)",
            }}
          />
          <button className="btn" onClick={goToLine}>
            Go
          </button>
        </span>
        {tab.parseError && (
          <button
            className="btn"
            style={{ color: "var(--t-removed)" }}
            onClick={() =>
              virtualizer.scrollToIndex(Math.max(0, tab.parseError!.line - 1), {
                align: "center",
              })
            }
          >
            Jump to error (L{tab.parseError.line})
          </button>
        )}
      </div>

      <div className="scroll" ref={parentRef} style={{ top: 36 }}>
        <div
          className={`raw${wrap ? " wrap" : ""}`}
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        >
          {items.map((vi) => {
            const line = get(vi.index);
            const isErr = tab.parseError && tab.parseError.line === vi.index + 1;
            return (
              <div
                key={vi.key}
                className="raw-row"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                  background: isErr
                    ? "color-mix(in srgb, var(--t-removed) 18%, transparent)"
                    : undefined,
                }}
              >
                <span className="raw-gutter" style={{ width: gutterWidth }}>
                  {vi.index + 1}
                </span>
                <span className="raw-line">{line ?? ""}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
