# Privacy

JSTools JSON Studio is a **local-only** desktop application. Your data never leaves your computer.

## What the app does

- Opens and reads JSON / JSONL / NDJSON files **you** choose (via the file picker or drag-and-drop), or text you paste in.
- Processes everything **on your machine** — parsing, search, JSONPath queries, diffing, and the JSONL table all run locally in the app's Rust backend.

## What the app does NOT do

- **No network access.** The app makes no HTTP requests. A strict Content-Security-Policy (`default-src 'self'`) blocks remote content, and the Tauri capability set grants no networking permissions.
- **No telemetry. No analytics.** Nothing about your usage or your files is collected or transmitted.
- **No accounts, no cloud, no sync.**
- **No file contents are ever uploaded** or sent anywhere.
- **No code execution from JSON.** JSON is treated strictly as data; there is no `eval`.

## What is stored locally

The app keeps a small amount of state in your OS application-config directory, on your machine only:

- **Recent files** — file paths (not contents), pin state, and last-opened timestamps.
- **Settings** — your preferences (theme, fonts, limits, etc.).

Pasted/scratch documents live only in memory and are discarded when closed, unless you explicitly **Save as…** to a file.

## Your controls

- **Settings → Clear local history** removes the recent-files list and query history.
- You can delete the app config directory at any time to remove all stored state.
- Recent entries can be removed or unpinned individually from the start screen.

## Permissions

The app requests the minimum OS capabilities it needs: reading files you open, the open/save dialogs, and watching opened files for external changes. It does not request shell execution, arbitrary filesystem access, or network access.
