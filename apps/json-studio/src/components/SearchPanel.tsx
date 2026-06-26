import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { SearchResult } from "@jstools/json-ui";
import type { Tab } from "../stores/app";
import { useApp } from "../stores/app";
import { useSettings } from "../stores/settings";
import { runSearch } from "../ipc/commands";

export function SearchPanel({ tab }: { tab: Tab }) {
  const toggleSearch = useApp((s) => s.toggleSearch);
  const gotoNode = useApp((s) => s.gotoNode);
  const searchLimit = useSettings((s) => s.searchLimit);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [inKeys, setInKeys] = useState(true);
  const [inValues, setInValues] = useState(true);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [exact, setExact] = useState(false);
  const [regex, setRegex] = useState(false);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const parsed = tab.metadata.node_count > 0;

  async function run() {
    if (!parsed) {
      setError("Document has no parsed tree (open it in Raw view).");
      return;
    }
    if (!query) {
      setResults([]);
      setDurationMs(null);
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const outcome = await runSearch(tab.docId, {
        query,
        in_keys: inKeys,
        in_values: inValues,
        case_sensitive: caseSensitive,
        exact,
        regex,
        subtree_root: null,
        limit: searchLimit,
      });
      setResults(outcome.results);
      setTruncated(outcome.truncated);
      setDurationMs(outcome.duration_ms);
      setSelected(0);
      if (outcome.results.length > 0) jump(outcome.results[0]!);
    } catch (e) {
      setError(String(e));
      setResults([]);
    } finally {
      setRunning(false);
    }
  }

  function jump(r: SearchResult) {
    gotoNode(tab.docId, r.node_id);
  }

  function step(delta: number) {
    if (results.length === 0) return;
    const next = (selected + delta + results.length) % results.length;
    setSelected(next);
    jump(results[next]!);
  }

  return (
    <div className="search-panel" role="dialog" aria-label="Search">
      <div className="search-row">
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search keys and values…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (results.length > 0 && query) step(e.shiftKey ? -1 : 1);
              else void run();
            } else if (e.key === "Escape") {
              toggleSearch(false);
            }
          }}
        />
        <button className="btn" onClick={() => void run()} disabled={running}>
          {running ? "…" : "Search"}
        </button>
        <button className="btn icon" aria-label="Previous" onClick={() => step(-1)}>
          <ChevronUp size={14} />
        </button>
        <button className="btn icon" aria-label="Next" onClick={() => step(1)}>
          <ChevronDown size={14} />
        </button>
        <span className="search-count">
          {results.length > 0
            ? `${selected + 1}/${results.length}${truncated ? "+" : ""}`
            : query && durationMs != null
              ? "0"
              : ""}
        </span>
        <button
          className="btn icon"
          aria-label="Close search"
          onClick={() => toggleSearch(false)}
        >
          <X size={14} />
        </button>
      </div>

      <div className="search-opts">
        <Toggle label="Keys" on={inKeys} set={setInKeys} />
        <Toggle label="Values" on={inValues} set={setInValues} />
        <Toggle label="Aa" title="Case sensitive" on={caseSensitive} set={setCaseSensitive} />
        <Toggle label="Exact" on={exact} set={setExact} />
        <Toggle label=".*" title="Regular expression" on={regex} set={setRegex} />
        {durationMs != null && !error && (
          <span className="search-meta">{durationMs} ms</span>
        )}
      </div>

      {error && <div className="search-error">{error}</div>}

      {results.length > 0 && (
        <div className="search-results">
          {results.map((r, i) => (
            <button
              key={`${r.node_id}-${r.match_kind}`}
              className={`search-hit${i === selected ? " selected" : ""}`}
              onClick={() => {
                setSelected(i);
                jump(r);
              }}
              title={r.path}
            >
              <span className={`hit-kind ${r.match_kind}`}>
                {r.match_kind === "key" ? "K" : "V"}
              </span>
              <span className="hit-path">{r.path}</span>
              <span className={`hit-preview ${r.value_type}`}>{r.preview}</span>
              <span className="hit-line">L{r.line}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  on,
  set,
  title,
}: {
  label: string;
  on: boolean;
  set: (v: boolean) => void;
  title?: string;
}) {
  return (
    <button
      className={`opt${on ? " on" : ""}`}
      title={title ?? label}
      aria-pressed={on}
      onClick={() => set(!on)}
    >
      {label}
    </button>
  );
}
