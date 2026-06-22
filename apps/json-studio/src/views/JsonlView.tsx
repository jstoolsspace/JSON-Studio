import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { JsonlField, JsonlRow } from "@jstools/json-ui";
import type { Tab } from "../stores/app";
import { useApp } from "../stores/app";
import { useWindowedRows } from "../hooks/useWindowedRows";
import { jsonlFields, jsonlWindow } from "../ipc/commands";

const MAX_DEFAULT_COLS = 12;

export function JsonlView({ tab }: { tab: Tab }) {
  const docId = tab.docId;
  const gotoLine = useApp((s) => s.gotoLine);
  const parentRef = useRef<HTMLDivElement>(null);

  const [fields, setFields] = useState<JsonlField[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [invalid, setInvalid] = useState(0);

  useEffect(() => {
    jsonlFields(docId)
      .then((f) => {
        setFields(f);
        setColumns(f.slice(0, MAX_DEFAULT_COLS).map((x) => x.name));
      })
      .catch(() => {});
  }, [docId]);

  const columnsKey = columns.join("");
  const { total, get, ensureRange } = useWindowedRows<JsonlRow>(
    async (offset, limit) => {
      const w = await jsonlWindow(docId, columns, offset, limit);
      setInvalid(w.invalid);
      return { rows: w.rows, total: w.total };
    },
    [docId, columnsKey],
  );

  const virtualizer = useVirtualizer({
    count: total.current,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 20,
  });

  const items = virtualizer.getVirtualItems();
  const first = items.length > 0 ? items[0]!.index : 0;
  const last = items.length > 0 ? items[items.length - 1]!.index : 0;
  useEffect(() => {
    if (total.current > 0) ensureRange(first, last);
  }, [first, last, ensureRange, total, columnsKey]);

  function toggleCol(name: string) {
    setColumns((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }

  const colWidth = 200;

  return (
    <div className="jsonl">
      <div className="jsonl-bar">
        <span className="search-meta">
          {total.current.toLocaleString()} records
          {invalid > 0 && <span className="jsonl-invalid"> · {invalid} invalid</span>}
        </span>
        <div className="jsonl-cols">
          {fields.map((f) => (
            <button
              key={f.name}
              className={`opt${columns.includes(f.name) ? " on" : ""}`}
              title={`${f.count} records`}
              onClick={() => toggleCol(f.name)}
            >
              {f.name}
            </button>
          ))}
        </div>
      </div>

      <div className="jsonl-head" style={{ paddingLeft: 96 }}>
        {columns.map((c) => (
          <span key={c} className="jsonl-th" style={{ width: colWidth }}>
            {c}
          </span>
        ))}
      </div>

      <div className="scroll" ref={parentRef} style={{ top: 76 }}>
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const row = get(vi.index);
            return (
              <div
                key={vi.key}
                className={`jsonl-row${row && !row.valid ? " invalid" : ""}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start}px)`,
                }}
                onClick={() => row && gotoLine(docId, row.line)}
              >
                <span className="jsonl-idx">{vi.index}</span>
                <span className="jsonl-ln">L{row?.line ?? ""}</span>
                {row
                  ? row.cells.map((cell, ci) => (
                      <span key={ci} className="jsonl-td" style={{ width: colWidth }}>
                        {cell ?? ""}
                      </span>
                    ))
                  : columns.map((_, ci) => (
                      <span key={ci} className="jsonl-td" style={{ width: colWidth }}>
                        …
                      </span>
                    ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
