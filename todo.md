# CardWriter TODO

Status of the Elm → React 19 + TypeScript migration. The plan lives in
[`REWRITE_PLAN.md`](REWRITE_PLAN.md); this file tracks execution.

## Current status

- [x] Migration plan: React 19 + TS, esbuild IIFE, phased replacement
- [x] Phase 0: React/TS toolchain, `tsconfig.json`, `npm run typecheck`
- [x] Phase 0: typed `window.electronAPI` and shared i18n module
- [x] Phase 1: React Home window (new/open/import, recent documents, remove)
- [x] Phase 1: Home switched to the React bundle; E2E asserts
      `#container[data-renderer="react"]`
- [x] `npm run check` passes locally
- [x] `npm test` passes locally (31 tests)
- [x] **CI verification of Phase 0/1**:
      [run 43147666793](https://github.com/ifwere/CardWriter/actions/runs/43147666793)
      - `check`, `typecheck`, 31 unit tests, build and E2E (2/2) pass
      - React Home bundle loads under the CSP (`home.js` 789.8kb)
      - Electron 32.3.3 x64 dmg + zip built unsigned and uploaded
        (`CardWriter-macos-x64`, ~236 MB)

Phase 2 is implemented locally and waits for the next green CI run.

## Immediate blockers

- [ ] Push Phase 2 and confirm the new help-window E2E test passes
- [ ] Compact the i18n catalogs so the React Home bundle stops shipping all
      18 languages (see technical debt below)

## Phase 2 — React help windows

- [x] Port the shortcuts window (`Doc.HelpScreen.viewShortcuts`) to React
      - all 7 tables, `isMac` Ctrl/Cmd labels and i18n keys preserved
      - reuses `shortcuts-modal.css`
- [x] Port the videos window (`Doc.VideoViewer`) to React
      - four items, active state and the Vimeo iframe preserved
- [x] Port the support window; `mailto:` + `shell.openExternal` preserved
      - build tokens `{%SUPPORT_EMAIL%}` / `{%SUPPORT_URGENT_EMAIL%}` are now
        substituted into React bundles too
- [x] Keep `faq-modal.html` as static HTML (it only contains links)
- [x] Switch the three templates to React bundles
- [x] Update `build-inputs.mjs`, `check.mjs`, unit tests and E2E
      - new E2E opens all three windows through their menu items
- [x] Remove the Elm modal entries from `ELM_ENTRIES`
- [x] Delete the legacy `src/electron/*-modal.js` shells
- [ ] CI verification of Phase 2 (pending push)

## Phase 3 — TypeScript core model (no UI)

- [ ] Port `Coders.normalizeInput` / `normalizeAndParse` to TypeScript
- [ ] Port `treeToMarkdownOutline` with byte-identical output
- [ ] Define the tree/card types shared by the editor and main process
- [ ] Port tree operations needed by the editor (insert, split, merge, move,
      delete, indent/outdent)
- [ ] Port undo/redo selection semantics
- [ ] Port the version object codecs (`ref`, `commit`, `tree`)
- [ ] Preserve `last-actives` settings decoding
- [ ] Golden fixtures: nested cards, code blocks, emphasis, empty cards,
      Chinese/emoji, CRLF, cards containing literal `<gingko-card` text
- [ ] Round-trip tests: parse → serialize must equal the original bytes
- [ ] Keep pure model modules free of Electron/React imports so `node --test`
      can run them via Node's TypeScript stripping

## Phase 4 — React document shell

- [ ] Document window layout: columns, cards, active card, scrolling
- [ ] Zustand + Immer document store with selector-based subscriptions
- [ ] Card component and per-card textarea editing
- [ ] Selection and edit/read mode transitions
- [ ] File-save indicator and dirty state
- [ ] Fullscreen mode
- [ ] Reuse `style.css` / `desktop.css` class names and DOM ids

## Phase 5 — Interaction parity

- [ ] Keyboard shortcuts (`Mousetrap` behavior, textarea exceptions)
- [ ] Drag/drop with `@dnd-kit/core`
- [ ] Clipboard: JSON subtree copy/paste, plain-text paste
- [ ] Text surround, checkbox toggles, cursor placement
- [ ] Autosave: `SaveToFile` timing and `.swp` writes
- [ ] `CommitData` on the same triggers as `LocalSaveDo` / `CommitDo`
- [ ] Close/quit prompts: unsaved untitled document, dirty saved document
- [ ] Menu acceleration rules (`registerAccelerator: false` for edit actions)
- [ ] Anchor/header navigation and scroll restoration

## Phase 6 — History, import, export

- [ ] Version-history slider and commit checkout/restore
- [ ] History rendering from grouped `ref` / `commit` / `tree` objects
- [ ] Export preview and DOCX export through pandoc
- [ ] Replace `elm-worker.js` with a TypeScript JSON importer
- [ ] Verify `.gko` behavior matches the current port

## Phase 7 — Remove Elm

- [ ] Delete `src/elm/`, `elm.json`, `elm-stuff/`, and the `elm` dependency
- [ ] Remove Elm entries from `scripts/build-inputs.mjs`
- [ ] Remove Elm post-processing from `scripts/translations.mjs`
      (keep only what the React catalogs need)
- [ ] Delete unused `src/electron/renderer.js`, `home.js` and DOM helpers
- [ ] Update `check.mjs`, unit tests, E2E, README and this file
- [ ] Final CI run: typecheck, build, E2E, dmg/zip artifacts
- [ ] Smoke-test the packaged app on macOS 12 Intel

## Compatibility checklist

- [ ] `.gkw` parse/serialize is byte-identical to the Elm implementation
- [ ] Existing `.gkw` and `.gko` files open without visual change
- [ ] `versionhistory/*/objects.log` replays with the same commit SHAs
- [ ] `settings.json` keys and per-document values are unchanged
- [ ] `.swp` open/save/save-as behavior is unchanged
- [ ] File associations for `.gkw` / `.gko` still work
- [ ] Recent documents (Home and macOS menu) still update
- [ ] DOCX export output remains valid

## Test matrix per phase

- [ ] `npm run check`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] GitHub Actions `macos-15-intel` artifacts

## Technical debt / follow-ups

- [ ] Evaluate the newest Electron major that still supports macOS 12;
      Electron 32 is EOL (remote Vimeo iframe is the main exposure)
- [ ] Consider opening help videos in the system browser to remove remote
      content from the renderer entirely
- [ ] Generate compact per-language catalogs; the bundled JSON is ~736 KB raw
- [ ] Add `package-lock.json` for reproducible installs
- [ ] Remove the `.snapshot/` working directory
- [ ] Keep the Elm package cache in CI stable (`~/.elm`)
- [ ] Revisit `versionhistory` compaction thresholds for very large documents

## Deferred features (per current scope)

New features are intentionally **not** part of the migration. Architecture
should leave room for them later:

- [ ] AI writing assistant (summarize / continue / rewrite; Claude API)
- [ ] Cloud sync and multi-device accounts
- [ ] Rich text, images, tables, attachments
- [ ] Full-text search, tabs, command palette

## Conventions

- Commit after each phase (or each independently testable slice).
- Keep the old Elm path runnable until its replacement passes CI.
- Never change on-disk formats without a migration and round-trip tests.
- No native modules; no local build environment required.
