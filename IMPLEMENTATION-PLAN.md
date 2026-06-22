# JSTools JSON Studio — Implementation Plan

Phased, session-sized plan. Each **session** is a self-contained chunk that compiles, tests, and produces something runnable, so the work never collapses into one giant unreviewable change. After every phase: run that phase's tests before moving on.

> **Environment note.** Writing the codebase can happen here. *Compiling* the Tauri/Rust app, running Clippy, executing `tauri-driver` e2e, and producing signed installers must happen on your machine or in CI. The Definition-of-Done items that need a real toolchain are flagged **[local/CI]**.

---

## Recommended session split

| Session | Theme | Phases | Outcome you can use |
|---|---|---|---|
| **A** | Foundation + read | 0–6 | Open a file (picker + drag-drop), view it lossless in Raw and a virtualized Tree, even for large files. |
| **B** | Find + ask | 7–9 | Search (keys/values/regex) and JSONPath query, with tabs & recent files. |
| **C** | Compare + records | 10–12 | File watching, JSON Diff, JSONL/NDJSON table. |
| **D** | Polish + ship | 13–16 | Settings, accessibility pass, tests/benchmarks, installers + docs. |

This matches your instinct to do *file-open + lossless Raw/Tree* first, then *search/query*, then *diff + JSONL*.

---

## Phase 0 — Workspace scaffold
**Build:** pnpm + Cargo dual workspace; `apps/json-studio` (Tauri 2.9 + React + Vite + TS); empty `packages/json-core` (Rust) and `packages/json-ui` (TS); base tsconfig; design tokens + Geist/JetBrains Mono wired; strict CSP + minimal capabilities stub; `specta` type-gen wired.
**Tests/DoD:** `pnpm typecheck`, `cargo check`, app launches to an empty shell. **[local]** dev run.

## Phase 1 — Secure file open + drag-and-drop
**Build:** system file picker (`Ctrl/Cmd+O`), window file-drop handler, format detection (.json/.jsonl/.ndjson), encoding detection, `DocumentRegistry`, mmap of the opened file, path validation/canonicalization.
**Tests:** path-validation unit tests; open/drop integration test; rejects missing/oversized paths gracefully.

## Phase 2 — Lossless parser adapter (`json-core`)
**Build:** lexer wrapper (`hifijson`) + streaming indexer (`struson`) → node index + line-offset index; lazy value materialization from byte spans; `ParseError` with line/column/offset; `DocumentMetadata`.
**Tests (critical):** big-int `9223372036854775807` preserved; `0.1234567890123456789` preserved; object key order preserved (incl. numeric-looking keys `"2"` before `"1"`); invalid JSON → precise error location. **These are the lossless guarantees — they gate the whole project.**

## Phase 3 — Raw View
**Build:** virtualized line viewer backed by line-offset index + range reads; line numbers, word wrap, go-to-line, copy selection/all, encoding select, in-file search, parse-error markers → jump-to-line; editable below threshold (CodeMirror 6) with save-as-new-file.
**Tests:** range-read correctness; go-to-line; large-file chunked render smoke test.

## Phase 4 — Virtualized Tree View
**Build:** `tree_window` command; virtualized tree; collapse/expand, expand/collapse subtree, expand-to-depth, nesting guides, type/count badges, source line/offset, persisted expansion, keyboard nav, ARIA tree, jump-to-JSONPath; context menu (copy value/key/object/JSONPath/JSON Pointer/raw; expand/collapse subtree; compare subtree).
**Tests:** windowing correctness; expansion-state persistence; keyboard-nav unit tests; copy-path/pointer correctness.

## Phase 5 — Large-file hardening
**Build:** progressive/streaming parse with progress channel + cancellation; memory limits with clear OOM-avoidance error; lazy child loading; ensure no whole-file/whole-tree crosses the boundary.
**Tests:** cancellation works mid-parse; memory-limit error path; **[local]** 100 MB / 500 MB smoke (time-to-first-render, peak memory).

## Phase 6 — Tabs + shell
**Build:** multi-document tabs (name, modified indicator, size, close, watch status), toolbar (logo, Open, New Tab, Search, Theme, Settings), view-mode switch (Tree/Raw/Query/Diff), side panel.
**Tests:** tab lifecycle; per-tab state isolation.

*— End of Session A —*

## Phase 7 — Search
**Build:** keys / values / keys+values; exact, case-sensitivity, regex; scope to subtree; Next/Prev; progress + cancel; match count; results with preview/type/JSONPath/JSON Pointer/line + jump-to-node. Runs in a Rust worker. `Ctrl/Cmd+F`.
**Tests:** key vs value matching; regex; case sensitivity; subtree scoping; cancel.

## Phase 8 — JSONPath Query
**Build:** `serde_json_path` execution in a cancellable worker; editor, Run/Cancel, per-document history, execution time, result count, tree/raw preview, copy result, copy result paths, export JSON/JSONL. `Ctrl/Cmd+Enter`.
**Tests:** RFC 9535 selector cases; execution-time/count; export round-trip; per-document history isolation.

## Phase 9 — Recent files
**Build:** local store of recent + pinned files, last position, last tab, query history, per-document settings; never auto-open missing/moved files; nothing in telemetry/cloud.
**Tests:** persistence; missing-file handling.

*— End of Session B —*

## Phase 10 — File watching
**Build:** `notify` watcher (debounced); change notification, Reload prompt, Auto-Reload toggle; preserve view position + reopen prior JSONPath; never clobber unsaved edits.
**Tests:** watcher fires on change; auto-reload preserves position; unsaved-edit guard.

## Phase 11 — JSON Diff
**Build:** pick two open docs; Tree Diff (added/removed/changed/unchanged + filter) and Raw Diff (`similar`); synced scroll, next/prev change, copy path, export patch, summary counts; array modes order-sensitive / match-by-index / match-by-key; structural object compare.
**Tests:** structural equality ignoring key order; each array mode; added/removed/changed classification; patch export.

## Phase 12 — JSONL / NDJSON mode
**Build:** virtualized record table; column select, filter, per-row JSONPath, invalid-row markers, filtered export, field statistics.
**Tests:** record splitting; invalid-row detection; filtered export; field stats.

*— End of Session C —*

## Phase 13 — Settings
**Build:** theme (System/Light/Dark), font size, line height, indent width, word wrap, default view, collapse depth, max memory, auto-reload, recent-files limit, search-result limit, clear local history.
**Tests:** persistence; settings affect behavior; clear-history wipes local stores.

## Phase 14 — Accessibility pass
**Build:** finalize keyboard map, ARIA roles, visible focus, SR labels, UI zoom, shortcut conflict audit.
**Tests:** keyboard-only flows; **[local]** AA contrast + SR spot-checks.

## Phase 15 — Tests + benchmarks
**Build:** complete Rust/TS unit suites, Tauri integration suite, `criterion` benchmark set (1/10/100/500 MB, deep nesting, 1M-element array, 1M-line JSONL, big numbers, invalid). Capture metrics in `PERFORMANCE.md`.
**Tests:** full suite green; benchmarks recorded.

## Phase 16 — Packaging + docs
**Build:** Tauri bundles (Windows MSI/NSIS, macOS DMG, Linux AppImage/deb); GitHub Actions (lint, typecheck, cargo test+clippy, vitest, build, release artifacts); finalize README/PRIVACY/ROADMAP/PERFORMANCE/RELEASE; signing/auto-update documented but key-gated.
**DoD [local/CI]:** typecheck ✓ · cargo check + clippy ✓ · all tests ✓ · production build ✓ · Windows installer verified ✓ · no network requests observed ✓ · capabilities reviewed ✓ · final file tree + feature list + known limitations emitted.

---

## Out of MVP (see `ROADMAP.md`)
API client, cloud sync, collaboration, accounts, AI, plugins, database viewer, YAML/XML, premium features.
