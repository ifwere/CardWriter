// Fast structural checks that do not require installed dependencies.
// Run with: npm run check

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const problems = [];

function fail(message) {
  problems.push(message);
}

// 1. The port must not reintroduce native/server-only dependencies.
const FORBIDDEN = ["leveldown", "levelup", "pouchdb", "dexie", "immortal-db", "electron-store", "electron-updater"];
const electronDir = path.join(ROOT, "src", "electron");
for (const file of fs.readdirSync(electronDir).filter((name) => name.endsWith(".js"))) {
  const code = fs.readFileSync(path.join(electronDir, file), "utf-8");
  for (const dep of FORBIDDEN) {
    if (new RegExp(`require\\(["']${dep}["']\\)|from ["']${dep}["']`).test(code)) {
      fail(`${file} imports forbidden dependency ${dep}`);
    }
  }
}

// 2. Every HTML template needs a CSP.
const htmlDir = path.join(ROOT, "src", "electron", "html");
for (const file of fs.readdirSync(htmlDir).filter((name) => name.endsWith(".html"))) {
  const html = fs.readFileSync(path.join(htmlDir, file), "utf-8");
  if (!html.includes("Content-Security-Policy")) fail(`${file} has no Content-Security-Policy`);
}

// 3. Build inputs referenced by the build script exist.
for (const input of [
  "src/elm/Electron/Home.elm",
  "src/renderer/home/main.tsx",
  "src/renderer/home/HomeApp.tsx",
  "src/renderer/shortcuts/main.tsx",
  "src/renderer/shortcuts/ShortcutsApp.tsx",
  "src/renderer/videos/main.tsx",
  "src/renderer/videos/VideosApp.tsx",
  "src/renderer/support/main.tsx",
  "src/renderer/support/SupportApp.tsx",
  "src/renderer/editor/main.tsx",
  "src/renderer/editor/keyboard.ts",
  "src/renderer/editor/components/EditorApp.tsx",
  "src/renderer/editor/components/TreeView.tsx",
  "src/renderer/editor/components/Card.tsx",
  "src/renderer/editor/components/Breadcrumbs.tsx",
  "src/renderer/editor/components/SaveIndicator.tsx",
  "src/renderer/editor/components/SearchField.tsx",
  "src/renderer/editor/components/MobileButtons.tsx",
  "src/renderer/editor/components/FullscreenEditor.tsx",
  "src/renderer/editor/components/ExportMenu.tsx",
  "src/renderer/editor/components/icons.tsx",
  "src/renderer/editor/model/coders.ts",
  "src/renderer/editor/model/tree.ts",
  "src/renderer/editor/model/treeOps.ts",
  "src/renderer/editor/model/treeView.ts",
  "src/renderer/editor/model/text.ts",
  "src/renderer/editor/model/markdown.ts",
  "src/renderer/editor/model/export.ts",
  "src/renderer/editor/model/history.ts",
  "src/renderer/editor/state/documentStore.ts",
  "src/renderer/editor/dom/viewport.ts",
  "src/renderer/editor/dom/useScrollEffects.ts",
  "src/renderer/shared/ModalFrame.tsx",
  "src/renderer/shared/api.ts",
  "src/renderer/shared/i18n.ts",
  "src/static/style.css",
  "src/bin/mac/pandoc",
  "config.js",
  "elm.json",
  "tsconfig.json"
]) {
  if (!fs.existsSync(path.join(ROOT, input))) fail(`missing build input ${input}`);
}

if (problems.length) {
  console.error("check failed:");
  for (const problem of problems) console.error(" -", problem);
  process.exit(1);
}

console.log("check ok");
