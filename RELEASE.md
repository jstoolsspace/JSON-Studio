# Release

## Local build

Prerequisites: Node ≥ 20, pnpm 9, the Rust toolchain, and the [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm rust:test
pnpm rust:clippy
pnpm build        # tauri build → installers under apps/json-studio/src-tauri/target/release/bundle/
```

Icons are committed in `apps/json-studio/src-tauri/icons/`. To regenerate from a source image: `pnpm tauri icon path/to/logo.png`.

## Bundle targets

Configured in `apps/json-studio/src-tauri/tauri.conf.json`:

- **Windows** — MSI and NSIS
- **macOS** — DMG
- **Linux** — AppImage and `.deb`

Build per-OS on that OS (or via CI runners); cross-compiling desktop bundles is not supported by Tauri out of the box.

## CI

`.github/workflows/ci.yml` runs, on push/PR:

- frontend: `pnpm typecheck`, `pnpm test`
- rust: `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test`

`.github/workflows/release.yml` builds per-OS installers via `tauri-action` and uploads them to a **draft** GitHub Release. It runs on a `v*` tag push (or manually via *workflow_dispatch*):

- macOS: builds both `aarch64` and `x86_64` (two DMGs)
- Linux (ubuntu-22.04): AppImage + `.deb`
- Windows: MSI + NSIS

The release is created as a draft so you can review assets and notes before publishing. Signing/notarization secrets are referenced (commented) in the workflow `env` and activate the corresponding steps once provided.

## Code signing & auto-update (documented, key-gated — not enabled)

These are intentionally **off** until signing material exists. Do not enable them in CI without configuring the secrets below.

### Windows
- Sign MSI/NSIS with an Authenticode certificate (EV recommended to avoid SmartScreen warnings).
- Provide the cert via CI secrets and configure `bundle.windows.certificateThumbprint` / signing command.

### macOS
- Requires an Apple Developer ID Application certificate.
- Sign and **notarize** the DMG (`xcrun notarytool`), then staple.
- Secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`.

### Linux
- AppImage/deb are typically distributed unsigned; optionally provide a detached GPG signature / checksums.

### Auto-update
Off by default. To enable later, in this order:

1. `pnpm add -D @tauri-apps/cli` then `pnpm tauri signer generate -w ~/.tauri/jsonstudio.key` — keep the **private** key out of the repo; add it (and its password) as the CI secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
2. Add the **public** key under `plugins.updater.pubkey` in `tauri.conf.json` and add the `@tauri-apps/plugin-updater` + `tauri-plugin-updater` dependencies.
3. Point `plugins.updater.endpoints` at a hosted `latest.json` manifest (e.g. the GitHub Releases `latest/download/latest.json`).
4. `tauri-action` signs the artifacts and emits `latest.json` automatically once the signing secrets are present; attach it to the release.

Until those secrets exist the build stays unsigned and the updater is disabled — nothing here ships a key.

## Versioning

Bump `version` in the root `package.json`, `apps/json-studio/package.json`, the crate `Cargo.toml`s, and `tauri.conf.json` together. Tag `vX.Y.Z` to trigger the (future) release workflow.
