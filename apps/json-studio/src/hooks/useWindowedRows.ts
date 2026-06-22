import { useCallback, useEffect, useRef, useState } from "react";

const CHUNK = 200;

/**
 * Generic loader for remotely-windowed row data (tree nodes, raw lines).
 * Keeps a sparse cache keyed by absolute row index and fetches missing chunks
 * on demand. `fetchWindow(offset, limit)` returns the rows plus the authoritative
 * total count.
 */
export function useWindowedRows<T>(
  fetchWindow: (offset: number, limit: number) => Promise<{ rows: T[]; total: number }>,
  deps: unknown[],
) {
  const cache = useRef<Map<number, T>>(new Map());
  const inflight = useRef<Set<number>>(new Set());
  const total = useRef<number>(0);
  const [, setTick] = useState(0);
  const force = useCallback(() => setTick((t) => t + 1), []);

  const reset = useCallback(() => {
    cache.current.clear();
    inflight.current.clear();
    total.current = 0;
  }, []);

  const load = useCallback(
    async (offset: number, limit: number) => {
      const key = offset;
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      try {
        const { rows, total: t } = await fetchWindow(offset, limit);
        total.current = t;
        for (let i = 0; i < rows.length; i++) {
          cache.current.set(offset + i, rows[i] as T);
        }
        force();
      } finally {
        inflight.current.delete(key);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    deps,
  );

  // Initial load whenever deps change.
  useEffect(() => {
    reset();
    void load(0, CHUNK);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const ensureRange = useCallback(
    (start: number, end: number) => {
      let missing = false;
      for (let i = start; i <= end; i++) {
        if (!cache.current.has(i)) {
          missing = true;
          break;
        }
      }
      if (!missing) return;
      const offset = Math.max(0, Math.floor(start / CHUNK) * CHUNK);
      const span = Math.ceil((end - offset + 1) / CHUNK) * CHUNK + CHUNK;
      void load(offset, span);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [load],
  );

  const get = useCallback((index: number): T | undefined => cache.current.get(index), []);

  return { total, get, ensureRange, reset };
}
