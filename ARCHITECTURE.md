# JSTools JSON Studio — Architecture

> A private desktop workspace for exploring, querying and comparing JSON.
> Status: **design / pre-implementation**. No application code exists yet — this document and `IMPLEMENTATION-PLAN.md` define the approach to review before any code is written.

---

## 1. Goals & non-negotiables

| Principle | Consequence for the design |
|---|---|
| **Everything stays local** | No network, no telemetry, no accounts. Strict CSP, minimal Tauri capabilities. |
| **Lossless** | Big integers, full-precision decimals, key order, and the original byte representation are preserved. `JSON.parse` is never the primary parser. |
| **Scales to ~500 MB** | The full document is never shipped into the WebView, and the file is never copied whole across the Rust↔WebView boundary. The backend owns the bytes; the UI requests only what is visible. |
| **Responsive under load** | Parsing, search, and query run off the UI thread, report progress, and are cancellable. |
| **Reusable core** | Parsing/search/query/diff live in a Rust crate (`json-core`) that also compiles to WASM, so a future Chrome extension can reuse it. |

---

## 2. Technology choices (verified June 2026)

### Runtime & shell

| Concern | Choice | Why / notes |
|---|---|---|
| App shell | **Tauri 2.9.x** (latest stable line) | Rust backend, system WebView, tiny binaries, fine-grained capability system. Not Electron. |
| Backend language | **Rust** | Filesystem, parsing, indexing, search, query, diff, file watching. |
| UI language | **TypeScript** | |
| UI framework | **React 18 + Vite** (primary) | Best ecosystem fit for the required virtualization and for reusing JSTools.Space design tokens. *SolidJS is a viable lighter-weight alternative if render cost becomes a bottleneck — the component layer is kept thin to keep that option open.* |
| UI state | **Zustand** | Minimal store for tabs, documents, view mode, settings. |
| Type sync | **specta + tauri-specta** | Generate TypeScript types for `json-core` models from the Rust source so `JsonNode`, `SearchResult`, etc. never drift between Rust and TS. |

### Core libraries (do not hand-roll these)

| Concern | Crate / package | Rationale |
|---|---|---|
| JSON lexing with byte spans | **`hifijson`** (high-fidelity lexer) | Gives token-level control and byte positions needed to build the offset index and report exact line/column errors. |
| Streaming structural reads | **`struson`** | Streaming reader/writer that can read numbers *as strings* (`next_number_as_str`) — lossless numbers without materializing the whole document. Used for the indexing pass and for streaming export. |
| Memory-mapped file access | **`memmap2`** | Lazy, range-based reads of the original bytes for huge files. |
| JSONPath | **`serde_json_path`** (RFC 9535) | Standards-compliant, clean serde integration. *`jsonpath-rust` (also RFC 9535, very widely used) is the fallback if a needed selector behaves differently.* |
| Text/raw diff | **`similar`** | Myers/patience line diff for Raw Diff. |
| Structural JSON diff | **custom, in `json-core`** | No mature crate covers our exact needs (key-order-insensitive, array match by index / by key / order-sensitive, offset-aware). Built on our own node model. |
| File watching | **`notify`** | The standard cross-platform watcher; debounced. |
| Encoding detection | **`encoding_rs` + `chardetng`** | UTF-8/16/Latin-1 detection and decoding for Raw View. |
| Cancellation | **`tokio_util::CancellationToken`** | Cancel in-flight parse/search/query. |
| Frontend virtualization | **`@tanstack/react-virtual`** | Mature windowing for the tree, JSONL table, and large result lists. |
| Raw editing (small files) | **CodeMirror 6** | Line numbers, go-to-line, search, editing — used only below the "editable" size threshold (see §6). |
| Icons | **`lucide-react`** | |
| Fonts | **Geist** (UI), **JetBrains Mono** (JSON) | Bundled locally; no web font fetches (CSP). |

**Explicitly NOT built by hand:** JSON parser, virtualization engine, file watcher, JSONPath parser, text-diff algorithm.

---

## 3. Repository layout

A pnpm + Cargo dual workspace (monorepo).

```text
json-studio/                      # repo root (this folder)
├─ package.json                   # pnpm workspace root
├─ pnpm-workspace.yaml
├─ Cargo.toml                     # cargo workspace root
├─ turbo.json                     # task orchestration (optional)
├─ tsconfig.base.json
├─ .github/workflows/ci.yml
├─ README.md
├─ ARCHITECTURE.md                # this file
├─ IMPLEMENTATION-PLAN.md
├─ PRIVACY.md
├─ ROADMAP.md
├─ PERFORMANCE.md
├─ RELEASE.md
│
├─ apps/
│  └─ json-studio/
│     ├─ src/                     # React + TS UI
│     │  ├─ main.tsx
│     │  ├─ app/                  # shell: toolbar, tabs, layout, command palette
│     │  ├─ views/                # tree/ raw/ query/ diff/ jsonl/
│     │  ├─ components/           # buttons, menus, status bar, dialogs
│     │  ├─ ipc/                  # typed wrappers over Tauri commands + channels
│     │  ├─ stores/               # zustand stores (tabs, settings, recent)
│     │  ├─ hooks/
│     │  ├─ styles/               # design tokens, themes, fonts
│     │  └─ a11y/                 # focus mgmt, aria helpers, shortcut map
│     ├─ src-tauri/
│     │  ├─ Cargo.toml
│     │  ├─ tauri.conf.json       # window, bundle, CSP
│     │  ├─ capabilities/         # least-privilege permission sets
│     │  └─ src/
│     │     ├─ main.rs
│     │     ├─ commands/          # open, read_range, tree_window, search, query, diff, watch
│     │     ├─ state.rs           # DocumentRegistry (id -> DocumentSession)
│     │     ├─ watcher.rs         # notify integration + debounce
│     │     └─ export.rs          # streaming JSON/JSONL export
│     ├─ tests/                   # integration (tauri-driver / webdriverio)
│     └─ README.md
│
└─ packages/
   ├─ json-core/                  # Rust crate — the reusable engine (also wasm target)
   │  ├─ Cargo.toml               # crate-type = ["lib", "cdylib"] for wasm
   │  └─ src/
   │     ├─ model/                # JsonNode, JsonPath, JsonPointer, ParseError,
   │     │                        #   SearchResult, QueryResult, DocumentMetadata
   │     ├─ parse/                # lexer wrapper, indexer, lossless value materialization
   │     ├─ index/                # node index + line/offset index + mmap access
   │     ├─ search/               # key/value/regex search over the index
   │     ├─ query/                # jsonpath execution + cancellation
   │     ├─ diff/                 # structural + raw diff
   │     ├─ jsonl/                # record splitting, field stats
   │     └─ wasm.rs               # wasm-bindgen surface (feature = "wasm")
   │
   └─ json-ui/                    # TS package — shared components + generated types
      └─ src/
         ├─ types/                # generated from json-core via specta
         └─ components/           # framework-light shared pieces (tree row, badges)
```

`json-core` is **the** durable asset: a pure Rust crate with no Tauri dependency, so the same parsing/search/query/diff compiles to WASM for a Chrome extension later. The Tauri app is a thin host around it.

---

## 4. Core data model (`json-core::model`)

These are the structs the prompt requires, shared everywhere and mirrored to TS.

- **`JsonNode`** — a node *descriptor*, not the data itself: `id`, `parent_id`, `key` (or array index), `value_type` (`String|Number|Boolean|Null|Object|Array`), `child_count`, `byte_start`, `byte_end`, `line`, `column`, `depth`, and a `preview` (truncated raw value). Values are materialized lazily from byte spans, never held wholesale for large docs.
- **`JsonPath`** — normalized JSONPath to a node (`$.a.b[2]`).
- **`JsonPointer`** — RFC 6901 pointer (`/a/b/2`).
- **`SearchResult`** — `path`, `pointer`, `value_type`, `preview`, `line`, `match_kind` (key/value), `node_id`.
- **`QueryResult`** — `nodes`, `count`, `execution_ms`, `truncated`.
- **`ParseError`** — `message`, `line`, `column`, `byte_offset`.
- **`DocumentMetadata`** — `path`, `size_bytes`, `encoding`, `format` (json/jsonl/ndjson), `line_count`, `parse_state`, `modified_on_disk`.

---

## 5. The lossless + large-file strategy (the heart of the design)

A single, size-tiered pipeline rather than two code paths:

1. **Open** → backend stats the file, detects encoding/format, and assigns a `document_id`. The file is **memory-mapped** (`memmap2`); bytes stay in the OS page cache, not copied to the heap or the WebView.
2. **Index pass (streaming, cancellable, with progress)** → a single streaming traversal (`struson`/`hifijson`) builds:
   - a **node index**: flat array of `JsonNode` descriptors with parent links and byte spans;
   - a **line-offset index**: byte offset of every line start (for Raw View + error/line jumps).
   Numbers and strings are recorded as **byte spans**, never as parsed `f64`/`String`. This is what makes it lossless and what keeps memory bounded — the index is ~tens of bytes per node regardless of value size.
3. **Lazy materialization** → when the UI needs a value (copy, preview, expand), the backend slices the exact bytes from the mmap and returns the original text. Big integers and `0.1234567890123456789` come back **verbatim**.
4. **Windowed tree** → the UI asks `tree_window(document_id, viewport_range, expanded_set)`; the backend returns only the descriptors for currently visible rows. Expanding a node lazily reveals its children from the index.

**Small-file fast path:** below a threshold (default ~16 MB) the backend may also keep a fully-materialized lossless value (serde_json with `arbitrary_precision` + `preserve_order`) to make query/diff cheaper. Above it, query/diff operate against the index + mmap and respect memory limits, surfacing a clear "document too large for in-memory operation" error instead of OOMing.

**Boundary rule:** the only things crossing Rust→WebView are (a) windows of node descriptors, (b) requested byte ranges, (c) search/query/diff results. Never the whole tree, never the whole file.

---

## 6. Views

- **Tree** — virtualized (`@tanstack/react-virtual`) over windowed descriptors; collapse/expand, expand/collapse subtree, expand-to-depth, nesting guides, type + count badges, source line/offset, persisted expansion state, full keyboard nav, ARIA `tree`/`treeitem`, jump-to-JSONPath, and the required context menu (copy value/key/object/JSONPath/JSON Pointer/raw; expand/collapse subtree; compare subtree).
- **Raw** — backend provides a line-offset index; the UI renders a **custom virtualized line viewer** backed by **range reads** for huge files (line numbers, word wrap, go-to-line, copy, encoding select, in-file search, parse-error markers with jump-to-line). **Editing** is offered only below an "editable" threshold via CodeMirror 6, and saves to a **new file** (no in-place rewrite of a 500 MB file). This trade-off is documented for the user.
- **Query** — JSONPath editor, Run/Cancel, per-document history, execution time, result count, tree/raw result preview, copy result, copy result paths, export JSON/JSONL.
- **Diff** — pick two open docs; structural Tree Diff (added/removed/changed/unchanged, filterable) and Raw Diff (`similar`); synced scroll, next/prev change, copy path, export patch, summary counts. Arrays support **order-sensitive / match-by-index / match-by-key** modes; objects compared structurally, never by key order.
- **JSONL/NDJSON** — virtualized record table, column selection, filter, per-row JSONPath, invalid-row markers, filtered export, field statistics.

---

## 7. Backend ↔ frontend contract

- **Commands** (request/response) for discrete actions: `open_document`, `close_document`, `get_metadata`, `read_range`, `get_tree_window`, `materialize_value`, `run_search`, `run_query`, `run_diff`, `export_*`, `watch_*`, `recent_*`, `settings_*`.
- **Channels** (Tauri 2 `Channel`) for streaming **progress + partial results + cancellation acks** during indexing, search, and query — this is what keeps the UI live and lets `Escape` cancel.
- **State**: a `DocumentRegistry` (id → `DocumentSession { mmap, index, metadata, watcher }`) guarded for concurrent access; heavy work runs on `spawn_blocking`/dedicated threads with a `CancellationToken` per operation.

---

## 8. Security model

- `tauri.conf.json` ships a **strict CSP** (`default-src 'self'`; no remote origins; no `unsafe-eval`).
- **Capabilities** are minimal and explicit: file read of user-chosen paths, the app's own commands, and the file-watch events — nothing else. No shell, no arbitrary fs, no http allowlist.
- All Rust command inputs (paths, ranges, ids) are **validated**: canonicalized paths, bounds-checked ranges, ids checked against the registry.
- JSON is **data**, never executed. No `eval`, no telemetry, no analytics, no uploads, no path exfiltration. (See `PRIVACY.md`.)

---

## 9. Accessibility

Full keyboard navigation, ARIA `tree`/`treeitem`/`grid` roles, visible focus, WCAG AA contrast (verified against the design tokens), screen-reader labels, UI zoom, and non-conflicting shortcuts: `Ctrl/Cmd+O` open · `Ctrl/Cmd+F` search · `Ctrl/Cmd+W` close tab · `Ctrl/Cmd+Shift+D` diff · `Ctrl/Cmd+Enter` run query · `Esc` cancel/close.

---

## 10. Testing & CI strategy

- **Rust:** unit tests (lossless numbers, key order, invalid JSON, JSONPath, diff, jsonl), `criterion` benchmarks, `clippy` clean.
- **TS:** Vitest + Testing Library (components, stores, ipc wrappers, keyboard nav).
- **Integration:** `tauri-driver` + WebdriverIO for command round-trips, drag-and-drop, file-watch reload, large-file smoke tests.
- **CI (GitHub Actions, matrix win/mac/linux):** lint → typecheck → cargo test + clippy → vitest → production build via `tauri-action`. Release artifacts (MSI/NSIS, DMG, AppImage/deb) built per-OS. Code signing & auto-update documented in `RELEASE.md` but disabled until keys exist.

---

## 11. Key trade-offs & open questions (for review)

1. **React vs SolidJS** — recommending React for ecosystem/token reuse; the thin component layer keeps Solid open if profiling demands it. *Confirm?*
2. **Raw editing of huge files** — proposing edit-only-below-threshold + save-as-new-file, since in-place editing of 500 MB is not realistic. *Acceptable?*
3. **Query/diff on >memory-limit documents** — proposing a clear "too large for in-memory op" error rather than attempting and OOMing. *Acceptable cap, or should we stream/spill to disk later?*
4. **Single index pipeline vs two paths** — recommending one streaming-index pipeline with a small-file fast path, for simpler reasoning. *Agree?*
5. **Build/installer verification** cannot happen in this assistant environment; it must run on your machine or in CI (covered in the plan's Definition of Done).
```
