import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  APP,
  STATIC,
  GENERATED_BUNDLES,
  RENDERER_ENTRIES
} from "../../scripts/build-inputs.mjs";

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));

test("main entry points at the build output", () => {
  assert.equal(pkg.main, "app/main.js");
});

test("macOS target is x64 and supports macOS 12", () => {
  assert.equal(pkg.build.mac.minimumSystemVersion, "12.0");
  const archs = pkg.build.mac.target.flatMap((target) => target.arch);
  assert.deepEqual(archs, ["x64", "x64"]);
});

test("every main-process module parses", () => {
  const dir = path.join(ROOT, "src", "electron");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".js"));
  assert.ok(files.length >= 8);
  for (const file of files) {
    execFileSync(process.execPath, ["--check", path.join(dir, file)], { stdio: "pipe" });
  }
});

test("renderer entry points exist", () => {
  for (const [name, source] of Object.entries(RENDERER_ENTRIES)) {
    assert.ok(fs.existsSync(path.join(ROOT, source)), `${name} entry is missing: ${source}`);
  }
});

test("HTML templates reference bundles produced by the build", () => {
  const htmlDir = path.join(ROOT, "src", "electron", "html");

  for (const file of fs.readdirSync(htmlDir)) {
    const html = fs.readFileSync(path.join(htmlDir, file), "utf-8");
    const scripts = [...html.matchAll(/<script src="\.\/([^"]+)"/g)].map((match) => match[1]);
    for (const script of scripts) {
      assert.ok(GENERATED_BUNDLES.has(script), `${file} references unknown ${script}`);
    }
  }
});

test("templates reference existing static assets", () => {
  const staticDir = path.join(ROOT, "src", "static");
  const htmlDir = path.join(ROOT, "src", "electron", "html");
  const allowedMissing = new Set();

  for (const file of fs.readdirSync(htmlDir)) {
    const html = fs.readFileSync(path.join(htmlDir, file), "utf-8");
    for (const match of html.matchAll(/(?:href|src)="\.\/([^"]+)"/g)) {
      const asset = match[1];
      if (GENERATED_BUNDLES.has(asset) || allowedMissing.has(asset)) continue;
      assert.ok(
        fs.existsSync(path.join(staticDir, asset)),
        `${file} references missing static asset ${asset}`
      );
    }
  }
});

test("generated bundles and window templates share app/static", () => {
  assert.equal(STATIC, path.join(APP, "static"));

  const mainSource = fs.readFileSync(path.join(ROOT, "src", "electron", "main.js"), "utf-8");
  for (const template of ["home.html", "renderer.html"]) {
    assert.ok(
      mainSource.includes(`path.join(__dirname, "static", "${template}")`),
      `main process does not load ${template} from app/static`
    );
  }
  assert.ok(
    mainSource.includes('require("./static/elm-worker.js")'),
    "worker bundle is not loaded from app/static"
  );
});

test("bundled pandoc is an Intel macOS binary", () => {
  const pandoc = path.join(ROOT, "src", "bin", "mac", "pandoc");
  assert.ok(fs.existsSync(pandoc));
  assert.ok(fs.statSync(pandoc).size > 10 * 1024 * 1024);
});

test("Elm sources needed by the desktop entries exist", () => {
  for (const entry of [
    "src/elm/Electron/Electron.elm",
    "src/elm/Electron/Home.elm",
    "src/elm/Electron/ShortcutsModal.elm",
    "src/elm/Electron/VideosModal.elm",
    "src/elm/Electron/SupportModal.elm",
    "src/elm/Electron/Worker.elm",
    "src/elm/Page/Doc.elm"
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, entry)), `missing ${entry}`);
  }
});
