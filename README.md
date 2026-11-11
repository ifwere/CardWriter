# CardWriter

CardWriter is a standalone Electron port of the Gingko Writer desktop client,
targeting **macOS 12 (Monterey) on Intel / x86_64**.

The writing UI is the original Elm application from `../client/client`; the
desktop shell is a rewrite that removes the native/server dependencies.

## Requirements

- macOS 12+ (Intel) for the packaged app
- Node.js 20+ and npm for building

## Build

```sh
npm install
npm run build      # compiles Elm + bundles renderer code into ./app
npm start          # build, then launch Electron
```

## Package for macOS Intel

```sh
npm run dist:mac
```

Outputs `dist/CardWriter-<version>-x64.dmg` and a `.zip`. The app is unsigned
and not notarized, so on first launch use right-click → Open (or
`xattr -dr com.apple.quarantine /Applications/CardWriter.app`).

`minimumSystemVersion` is pinned to `12.0` and the build is x64-only.

## Tests

```sh
npm run check      # structural / dependency checks
npm test           # unit tests (no npm install needed)
npm run test:e2e   # Playwright + Electron smoke tests (CI)
```

## Layout

```
src/elm/            Elm application (desktop entry points in src/elm/Electron)
src/shared/         DOM helpers shared with the Elm UI
src/electron/       Main process (CommonJS), preload, renderer glue, modals
src/electron/html/  Window HTML templates
src/static/         CSS, fonts, images from the original client
scripts/            Build pipeline and translation post-processing
i18n/               Translation tables used at build time
```

## Design notes

- **Zero native modules.** The original used LevelDB for version history; this
  port uses an append-only JSON log (`src/electron/version-store.js`). The main
  process has no runtime `node_modules` dependencies at all.
- **No remote services.** All documents are local `.gkw` files; export uses the
  bundled x86_64 pandoc binary.
- **Context isolation** is enabled for every window; all privileged operations
  go through the preload bridge.
- **Translations** are substituted after `elm make`, mirroring the upstream
  post-processing pass.

## Attribution

The Elm application and static assets are from the Gingko Writer client,
licensed MIT. See `LICENSE`.
