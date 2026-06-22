# Roadmap

## Shipped (Sessions A–D)

- **A** — Monorepo, lossless streaming index engine, Tauri backend, file open + drag-and-drop, virtualized Tree & Raw views, tabs.
- **B** — Search (keys/values/regex/subtree), JSONPath query (RFC 9535) with export, recent files, paste/scratch tabs.
- **C** — File watching + reload, structural JSON Diff (by index / by key), JSONL/NDJSON records table.
- **D (in progress)** — Settings (theme, fonts, indent, limits, defaults, clear history); save scratch tabs to file with large-content guidance. Remaining: accessibility finalization, benchmarks, packaging/CI release.

## Near-term polish

- Tree-node focus from search/diff/query results (expand ancestors + scroll), in addition to the current jump-to-Raw-line.
- Streaming progress + cancellation for search/query/diff on very large documents (today they run synchronously with a memory cap).
- In-place Raw editing for files under a threshold (currently view-only; scratch tabs are editable).
- Per-document persisted expansion/scroll restoration across reloads.
- Generated TypeScript types from `json-core` via `specta`/`tauri-specta` (today hand-mirrored).

## Not in scope (deliberately, for now)

These are explicitly **out** of the current product to keep it a focused, private, local JSON workspace:

- API client / HTTP request runner
- Cloud sync, collaboration, accounts
- AI features
- Plugins / extensions marketplace
- Database viewer
- YAML / XML / other formats
- Premium / paid tiers

If any of these are revisited, they will be designed to preserve the local-only, no-telemetry guarantees described in `PRIVACY.md`.
