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
  ["src/elm/Electron/Home.elm", "elm-home.js"],
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
  editor: "src/renderer/editor/main.tsx",
  home: "src/renderer/home/main.tsx",
  "shortcuts-modal": "src/renderer/shortcuts/main.tsx",
  "videos-modal": "src/renderer/videos/main.tsx",
  "support-modal": "src/renderer/support/main.tsx"
};

/** Every bundle name that a template can reference with `./`. */
export const GENERATED_BUNDLES = new Set([
  ...ELM_ENTRIES.map(([, output]) => output),
  ...Object.keys(RENDERER_ENTRIES).map((name) => `${name}.js`)
]);
