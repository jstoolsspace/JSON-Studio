# JSTools JSON Studio

> A private desktop workspace for exploring, querying and comparing JSON.

Built with Tauri 2 + Rust + React/TypeScript. Everything runs locally — no network, no telemetry, no accounts. See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design and [`IMPLEMENTATION-PLAN.md`](./IMPLEMENTATION-PLAN.md) for the phased plan.

## Status — Session A complete (Phases 0–6)

Implemented:

- **Monorepo**: pnpm + Cargo dual workspace (`apps/json-studio`, `packages/json-core`, `packages/json-ui`).
- **Lossless engine** (`json-core`): streaming, iterative (stack-safe) byte-span indexer that preserves big integers, full-precision decimals, key order and the exact source bytes. Lazy value materialization, line/column lookup, children/subtree enumeration, JSONPath + JSON Pointer building, and a windowed-tree flattener for virtualization. Covered by Rust unit tests for every lossless guarantee.
- **Tauri backend**: memory-mapped documents, a validated command surface (open, metadata, tree window, expand/collapse, materialize value, node path, raw lines), strict CSP and least-privilege capabilities.
- **UI**: app shell (toolbar, tabs, view switcher, status bar), system file picker + drag-and-drop open, a virtualized **Tree view** (collapse/expand, expand-to-depth, type/count badges, line markers, ARIA tree, context menu with copy value/key/object/JSONPath/JSON Pointer/raw + expand/collapse subtree) and a virtualized **Raw view** (line numbers, word wrap, go-to-line, jump-to-parse-error). Light/dark theming via design tokens.

## Status — Session B complete (Phases 7–9)

Added on top of Session A:

- **Search** (`json-core::search`): keys / values, exact / substring, case sensitivity, regular expressions, subtree scoping, result cap + truncation flag. Exposed via `run_search` and a `⌘/Ctrl+F` panel with match count, Next/Prev navigation, and jump-to-line. Rust unit tests cover every mode.
- **JSONPath query** (`json-core::query`, RFC 9535 via `serde_json_path`): results mapped back to index nodes by JSON Pointer so previews stay lossless. A functional Query view with Run (`⌘/Ctrl+Enter`), per-document history, execution time, match count, result list, copy paths / copy result, and Export JSON / JSONL (save dialog). In-memory query value is size-capped (64 MB) with a clear error above it.
- **Recent files** (`json-core`-free, persisted in the app config dir): list with open / pin / remove, shown on the start screen; nothing leaves the device.

## Status — Session C complete (Phases 10–12)

Added on top of Session B:

- **File watching** (`notify`): the backend watches open files and emits `document-changed`; a banner offers **Reload** with an **Auto-reload** toggle. Reload re-maps and re-indexes from disk, preserving expansion where possible.
- **JSON Diff** (`json-core::diff`): structural compare (key order ignored). Arrays match **by index** or **by key**; each entry carries separate left/right pointers (so by-key pairs at different indices resolve to the right source lines). The Diff view picks two open documents, shows added/removed/changed counts with filters, and jumps to either side.
- **JSONL / NDJSON table** (`json-core::jsonl`): records split + validated; a virtualized **Records** table with selectable columns, field stats (per-column counts), invalid-row highlighting, and jump-to-line. The view switcher shows Records/Raw/Diff for line-delimited files.
- Resilience: an error boundary now contains a view crash instead of blanking the app.
- **Scratch tabs**: **New tab** opens an in-memory document you paste/type JSON into; these are editable in place (**Edit content**) and behave like any other document, so you can paste two large payloads and compare them in Diff without saving files.

## Status — Session D in progress (Phase 13 done)

- **Settings** (persisted locally): theme (System/Light/Dark), monospace font size, line height, tree indent width, Raw word-wrap default, default JSON view, expand-depth on open, recent-files limit, search-results limit, query/diff memory cap, auto-reload default, plus **Clear local history** and **Reset to defaults**. Settings apply live across the app.
- Project docs added: `PRIVACY.md`, `ROADMAP.md`, `PERFORMANCE.md`, `RELEASE.md`.
- **Session restore**: open file-backed tabs (and the active one) are remembered and reopened on next launch (missing files are skipped silently).
- **Unsaved scratch guard**: closing a pasted/scratch tab that isn't saved prompts Save… / Don't save / Cancel.

**Accessibility (Phase 14):** full keyboard navigation in the Tree (↑/↓ move, →/← expand-collapse or move to child/parent, Enter/Space toggle, Home/End), ARIA `tree`/`treeitem` with `aria-activedescendant`, visible focus ring, and a keyboard-shortcuts overlay (press `?`).

**Benchmarks (Phase 15):** criterion engine benches (`pnpm bench`) for parse/index, navigation, search, query and diff; a fixture generator (`pnpm fixtures` / `pnpm fixtures:huge`) producing test files (1/10/100/500 MB, deep nesting, 1M-element array, 1M-line JSONL, big numbers, invalid) under `fixtures/`. See `PERFORMANCE.md`.

**Packaging + release (Phase 16):** `bundle.targets` configured for Windows (MSI/NSIS), macOS (DMG, both arches), Linux (AppImage/deb). `.github/workflows/release.yml` builds installers per-OS via `tauri-action` and uploads them to a draft GitHub Release on a `v*` tag. Code signing / notarization / auto-update are documented in `RELEASE.md` and key-gated (off until secrets are provided).

**Session D complete.** All planned phases (A–D) are implemented. Remaining work is operational, on your machine / CI: run the full `cargo test` + `clippy` + `pnpm typecheck/test`, a production `pnpm build`, verify the Windows installer, and record benchmark numbers in `PERFORMANCE.md`.

## Develop

Prerequisites: Node ≥ 20, pnpm 9, the Rust toolchain, and the [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm dev            # runs vite + tauri dev
```

Checks:

```bash
pnpm typecheck      # frontend TS
pnpm test           # frontend (vitest)
pnpm rust:test      # json-core + backend unit tests
pnpm rust:clippy    # lints
```

> App icons are committed in `apps/json-studio/src-tauri/icons/` (generated from
> [`brand/logo.svg`](./brand/logo.svg) / `brand/logo-1024.png`). To regenerate from a
> different source image, run `pnpm tauri icon path/to/logo.png`.

## Try it

A sample document lives in [`examples/sample.json`](./examples/sample.json), including a big integer and a high-precision decimal so you can confirm lossless rendering.

## License

MIT
