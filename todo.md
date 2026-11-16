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
- [x] **CI verification of Phase 0/1**:
      [run 43147666793](https://github.com/ifwere/CardWriter/actions/runs/43147666793)
      - `check`, `typecheck`, 31 unit tests, build and E2E (2/2) pass
      - React Home bundle loads under the CSP (`home.js` 789.8kb)
      - Electron 32.3.3 x64 dmg + zip built unsigned and uploaded
        (`CardWriter-macos-x64`, ~236 MB)
- [x] Phase 2: React help windows (shortcuts, videos, support)
- [x] Phase 3: TypeScript core model
- [x] Phase 4: React document shell — the document window now loads
      `editor.js` only; `"Elm" in window === false`
- [x] Local gate green after Phase 4: `check`, `typecheck`, 92 unit tests,
      `build`, 9 E2E tests

Phases 2–4 are implemented and verified locally but have not been pushed: this
checkout has no git remote configured.

## Immediate blockers

- [ ] Push Phases 2–4 and confirm CI is green (dmg/zip + E2E on macOS 12)
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

- [x] Port `Coders.normalizeInput` / `normalizeAndParse` to TypeScript
- [x] Port `treeToMarkdownOutline` with byte-identical output
- [x] Port Markdown/OPML/JSON export helpers (`treeToMarkdownString`,
      `treeToOPML`, `treeToJSON`, `treeToValue`)
- [x] Define the tree/card types shared by the editor and main process
- [x] Port structural tree operations (`Ins`, `Upd`, `Rmv`, `Mov`, `Mrg`,
      `Paste`, lookups, preorder walk, `labelTree`)
- [x] Split-at-cursor helpers (`splitBelow`, `splitAbove`, `splitRight`)
- [x] Text helpers: word/character counts, surround selection, heading levels,
      checkbox toggling
- [x] Column layout and navigation helpers (`treeView.ts`: `getColumns`,
      depth, prev/next in column, column edges)
- [x] Clipboard subtree copy/paste semantics land with Phase 5
- [ ] Keep version objects and undo in the main process (`commit.js`,
      `version-store.js`); the renderer only exchanges IPC payloads
- [x] Decode `last-actives` from the document payload (Phase 4 startup)
- [x] Golden fixtures: nested cards, code blocks, emphasis, empty cards,
      Chinese/emoji, CRLF, cards containing literal `<gingko-card` text
- [x] Round-trip tests: canonical parse → serialize is byte-identical, and
      every content case survives serialize → parse unchanged
- [x] Keep pure model modules free of Electron/React imports so `node --test`
      can run them via Node's TypeScript stripping (`tests/unit/coders.test.mjs`)

## Phase 4 — React document shell

- [x] Document window layout: columns, cards, active card, scrolling
      - `TreeView` reproduces `treeView` / `viewColumn` / `viewGroup`, including
        the empty-group alignment, fillets and the `ancestor` / `has-children`
        card classes
- [x] Zustand document store with selector-based subscriptions
      - mirrors `Page.Doc.Model`; no Immer needed because `treeOps` already
        returns new trees
- [x] Card component and per-card textarea editing
- [x] Selection and edit/read mode transitions (`normal` / `editing` /
      `fullscreen`)
- [x] File-save indicator and dirty state
- [x] Fullscreen mode
- [x] Reuse `style.css` / `desktop.css` class names and DOM ids
      - E2E asserts the same ids the Elm build produced
- [x] Markdown rendering through `marked` with the three `Doc.UI` rewrites
      (diff markers, checkboxes, `sanitize = False`)

## Phase 5 — Interaction parity

- [x] Keyboard shortcuts (`Mousetrap` behavior, textarea exceptions)
- [x] Drag/drop — implemented with native HTML5 drag events rather than
      `@dnd-kit/core`; the Elm view also used the native drag API and the
      existing `drag-region` / `drop-region-*` CSS, so this keeps the DOM
      contract and drops a dependency
- [x] Clipboard: JSON subtree copy/paste, plain-text paste
- [x] Text surround, checkbox toggles, cursor placement
- [x] Autosave: `SaveToFile` timing and `.swp` writes
      - 500 ms quiet debounce before `save-file`, matching `LocalSaveDo`
- [x] `CommitData` on the same triggers as `LocalSaveDo` / `CommitDo`
      - 3 s throttle, parented on `heads/master`
- [x] Close/quit prompts: unsaved untitled document, dirty saved document
- [x] Menu acceleration rules (`registerAccelerator: false` for edit actions)
- [x] Anchor/header navigation and scroll restoration
      - `getScrollPositions` drives `dom/viewport.ts` (`applyScroll`,
        `scrollFullscreenTo`, `updateFillets`) ported from the legacy renderer's
        GSAP helpers, with a tiny rAF tween replacing the GSAP dependency
      - `useScrollEffects` scrolls on init/activation, centres the card on
        entering fullscreen, realigns on exit, and persists `last-actives`
        through the debounced `local-store-set` channel
      - E2E: navigating a 41-card column scrolls it to keep the active card in
        view

## Phase 6 — History, import, export

- [x] Version-history slider and commit checkout/restore
      - `HistoryMenu` (`#history-menu` / `#history-slider` / `#history-restore` /
        `#history-close-button`) renders the saved commits oldest→newest and
        lets the user restore one; the working tree is replaced and re-committed
      - `history.ts` reconstructs any commit's tree (`treeFromCommit`) and
        builds the ordered commit list (`historyList`)
      - the save indicator hides while the menu is open so it does not swallow
        the restore click
- [x] History rendering from grouped `ref` / `commit` / `tree` objects
      - `decodeHistory` / `mergeHistory` already feed the store; the slider
        reads the same merged `HistoryData`
- [x] Export preview and DOCX export through pandoc (export menu from Phase 4;
      DOCX goes through the main-process pandoc)
- [x] Replace `elm-worker.js` with a Node importer
      - `src/electron/import-single.js` ports `Import.Single.decoder` +
        `Coders.treeToMarkdownOutline`: JSON arrays of `{ content, children }`
        are re-labelled in preorder, renumbered to `node-<sha1(salt+id)>` with
        a fresh 5-char salt, and serialized to the canonical outline
      - `main.js` imports JSON synchronously; the Elm worker bootstrap is gone
      - `build-inputs.mjs` / `check.mjs` drop the Worker entry; only the Home
        Elm bundle remains
      - unit tests (`import-single.test.mjs`) lock the outline shape and id
        uniqueness/rejections
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

- [x] `npm run check`
- [x] `npm run typecheck`
- [x] `npm test` (92 tests)
- [x] `npm run build`
- [x] `npm run test:e2e` (9 tests)
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

