// Declarative list of build inputs and output locations.
//
// Kept separate from build.mjs so tests can assert the layout without running
// the whole build (which needs the Elm compiler and esbuild installed).

import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const APP = path.join(ROOT, "app");
// HTML templates are loaded from app/static and reference their scripts with
// relative paths, so every generated bundle lives beside them.
export const STATIC = path.join(APP, "static");

export const ELM_ENTRIES = [
  ["src/elm/Electron/Electron.elm", "elm-electron.js"],
  ["src/elm/Electron/Home.elm", "elm-home.js"],
  ["src/elm/Electron/ShortcutsModal.elm", "elm-shortcuts.js"],
  ["src/elm/Electron/VideosModal.elm", "elm-videos.js"],
  ["src/elm/Electron/SupportModal.elm", "elm-support.js"],
  ["src/elm/Electron/Worker.elm", "elm-worker.js"]
];

/** Main-process modules are plain CommonJS; they are copied verbatim. */
export const MAIN_FILES = [
  "main.js",
  "menu.js",
  "commit.js",
  "pandoc.js",
  "version-store.js",
  "store.js",
  "util.js"
];

export const PRELOAD_FILES = ["preload.js"];

export const RENDERER_ENTRIES = {
  renderer: "src/electron/renderer.js",
  home: "src/renderer/home/main.tsx",
  "shortcuts-modal": "src/electron/shortcuts-modal.js",
  "videos-modal": "src/electron/videos-modal.js",
  "support-modal": "src/electron/support-modal.js"
};

/** Every bundle name that a template can reference with `./`. */
export const GENERATED_BUNDLES = new Set([
  ...ELM_ENTRIES.map(([, output]) => output),
  ...Object.keys(RENDERER_ENTRIES).map((name) => `${name}.js`)
]);
