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
  "src/elm/Electron/Electron.elm",
  "src/elm/Electron/Home.elm",
  "src/elm/Electron/ShortcutsModal.elm",
  "src/elm/Electron/VideosModal.elm",
  "src/elm/Electron/SupportModal.elm",
  "src/elm/Electron/Worker.elm",
  "src/electron/renderer.js",
  "src/electron/home.js",
  "src/static/style.css",
  "src/bin/mac/pandoc",
  "config.js",
  "elm.json"
]) {
  if (!fs.existsSync(path.join(ROOT, input))) fail(`missing build input ${input}`);
}

if (problems.length) {
  console.error("check failed:");
  for (const problem of problems) console.error(" -", problem);
  process.exit(1);
}

console.log("check ok");
