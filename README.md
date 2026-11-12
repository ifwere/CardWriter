# CardWriter

CardWriter is a standalone Electron port of the Gingko Writer desktop client,
targeting **macOS 12 (Monterey) on Intel / x86_64**.

The writing model is a tree of cards stored in a Markdown outline (`.gkw`), with
local version history and DOCX export. The app is fully offline: no account, no
sync service, and no runtime `node_modules` dependencies.

The UI is being migrated from Elm to **React 19 + TypeScript**. The Home window
already runs on React; document windows still use the Elm editor from the
client's `redesktop` 2.5.0 snapshot. See [`REWRITE_PLAN.md`](REWRITE_PLAN.md)
and [`todo.md`](todo.md) for the phased plan and current status.

## Tech stack

| Layer | Choice |
|---|---|
| Desktop shell | Electron 32 (x64), context isolation + sandboxed renderers |
| Renderer | React 19 + TypeScript (migration in progress) |
| Legacy editor | Elm 0.19.1, compiled with `elm make --optimize` |
| Bundling | esbuild, IIFE output (no ES modules on `file://`) |
| Editor state | Zustand + Immer (introduced with the React editor) |
| i18n | Existing `i18n/*.json` catalogs; `Intl` for dates |
| Local storage | Custom JSON store + append-only version log, no native modules |
| Export | Bundled x86_64 `pandoc` binary |
| Packaging | electron-builder 25, unsigned dmg + zip, macOS 12.0 minimum |
| CI | GitHub Actions on `macos-15-intel`, Playwright Electron E2E |

## Requirements

- **macOS 12+ on Intel** to run the packaged app
- **Node.js 20+ and npm** to build
- A macOS Intel machine is not required: the GitHub Actions workflow produces
  the artifacts

## Build and run

```sh
npm install
npm run build      # Elm bundles + React bundles + static files -> ./app
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

Support addresses and public URLs are build-time values in `config.js`; change
`SUPPORT_EMAIL` / `SUPPORT_URGENT_EMAIL` before shipping.

## Build on GitHub Actions

`.github/workflows/build-macos.yml` runs on the Intel `macos-15-intel` runner:

1. `npm install`
2. `npm run check`
3. `npm run typecheck`
4. `npm test`
5. `npm run build`
6. `npm run test:e2e`
7. `electron-builder --mac --x64`

It uploads the unsigned `.dmg` / `.zip` artifacts and, on failure, the
Playwright traces. Pushing to any branch triggers it; `workflow_dispatch` is
also enabled.

## Tests

```sh
npm run check      # structural / dependency / CSP checks
npm run typecheck  # TypeScript type checking (needs npm install)
npm test           # unit tests, dependency-free
npm run test:e2e   # Playwright + Electron smoke tests (needs a build)
```

The E2E suite asserts that the Home window is rendered by React
(`#container[data-renderer="react"]`) before opening a document.

## Layout

```
src/renderer/          React 19 + TypeScript UI (migration in progress)
  shared/              Typed preload API, i18n, Intl formatting
  home/                React Home window
src/elm/               Legacy Elm editor (removed in the final phase)
src/shared/            DOM helpers used by the Elm editor
src/electron/          Main process (CommonJS), preload, menus, file I/O
src/electron/html/     Window templates
src/static/            CSS, fonts, images from the original client
src/bin/mac/pandoc     Bundled Intel macOS pandoc
scripts/               Build pipeline, i18n post-processing, static checks
i18n/                  Translation catalogs
tests/unit/            Node test suites
tests/e2e/             Playwright Electron smoke tests
```

## Data and compatibility

- Documents are local `.gkw` / legacy `.gko` files; `.md` files can be opened.
- While a document is open, edits are written to a sibling `.swp` swap file and
  copied back on save.
- Version history lives under
  `userData/versionhistory/<basename>-<sha1>/objects.log` as an append-only
  JSON log of `commit` / `tree` / `ref` objects.
- Settings live in `userData/settings.json`; recent documents and per-document
  scroll state are keyed by absolute path.
- The rewrite must preserve these formats byte-for-byte; the migration plan
  includes golden round-trip tests before the editor is replaced.

## Design notes

- **Zero native modules.** LevelDB was replaced by an append-only JSON log, so
  the Intel macOS build needs no native rebuilds.
- **Offline by default.** No remote APIs, accounts, or telemetry.
- **Sandboxed renderers.** `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`; all privileged work goes through the preload bridge.
- **Strict CSP.** Every window ships a `Content-Security-Policy`; navigation and
  new windows are denied in favor of `shell.openExternal` for http(s)/mailto.
- **Translations.** The Elm build substitutes `%lang:Key%` placeholders after
  compilation; the React renderer uses the same JSON catalogs directly.

## Attribution

The Elm application and static assets are from the Gingko Writer client,
licensed MIT. See `LICENSE`.
