# Performance

## Design principles

- **Bounded memory.** A document is parsed into a compact pre-order node index (~tens of bytes per node) plus a line table. Values are kept as byte spans, never materialized wholesale.
- **Memory-mapped bytes.** File-backed documents are `mmap`-ed; bytes stay in the OS page cache, not copied onto the heap or shipped to the WebView.
- **Windowed UI.** The Tree, Raw, and JSONL views are virtualized and request only the visible window of node descriptors / lines from the backend. The whole document and the whole tree never cross the IPC boundary.
- **In-memory ops are capped.** JSONPath query and Diff build a `serde_json::Value`; this is capped (default 64 MB, configurable in Settings) and refused above the cap with a clear message rather than risking exhaustion.

## Running

Engine micro-benchmarks (criterion, ≈1–5 MB in-memory datasets):

```bash
pnpm bench            # cargo bench -p json-core
```

This benchmarks `parse`/index (records 1 MB & 5 MB, 100k-number array, deep nesting),
tree `visible_window`, `search` (keys + regex), `query` (parse value + `$[*].id`),
and `diff` (by index). HTML reports land in `target/criterion/`.

Large-file fixtures for testing in the app (windowing, JSONL table, big numbers, invalid input):

```bash
pnpm fixtures         # → fixtures/: bignums, invalid, deep, 1mb, 10mb, 100k.jsonl
pnpm fixtures:huge    # also 100mb, 500mb, array-1m, 1m.jsonl (slow, large)
```

Open the generated files from `fixtures/` in JSON Studio to validate time-to-first-render,
scroll responsiveness, and peak memory on the big inputs.

## Benchmark set

Targets to measure on representative hardware:

| Input | What to measure |
|---|---|
| 1 MB JSON | time-to-first-render, full parse, peak memory |
| 10 MB JSON | same |
| 100 MB JSON | same + scroll responsiveness |
| 500 MB JSON | time-to-first-render, peak memory (must stay bounded) |
| Deeply nested (50k levels) | parse without stack overflow (iterative parser) |
| Array of 1,000,000 elements | window fetch latency, scroll |
| JSONL with 1,000,000 lines | record split time, table window latency |
| Big numbers / high-precision decimals | losslessness (no rounding) |
| Invalid JSON | precise error location, graceful Raw fallback |

Metrics to capture per case: time to first paint, full parse/index time, peak RSS, search duration, query duration, scroll frame responsiveness.

## Notes & current limitations

- The parser is iterative (explicit stack), so deep nesting does not overflow; a generous depth is supported within memory limits.
- Byte offsets are `u32`, so the hard document ceiling is 4 GiB; the product target is 500 MB.
- Search runs in the Rust backend over the index; results are capped (configurable). Query/Diff are synchronous today — streaming progress and cancellation for very large inputs are on the roadmap.
- Recorded benchmark numbers will be added here once the `criterion` suite (Phase 15) is run on reference hardware.
