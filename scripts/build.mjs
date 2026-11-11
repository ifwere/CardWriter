// Builds the application into ./app.
//
// Pipeline:
//   1. compile each Elm entry point with `elm make --optimize`
//   2. substitute translation placeholders in the generated bundles
//   3. bundle renderer-side JS with esbuild (browser IIFE)
//   4. copy main-process CJS files, preload scripts and static assets

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

import { buildReplacements, applyTranslations, findUnreplaced } from "./translations.mjs";
import {
  ROOT,
  APP,
  STATIC,
  ELM_ENTRIES,
  MAIN_FILES,
  PRELOAD_FILES,
  RENDERER_ENTRIES
} from "./build-inputs.mjs";

function elmCommand() {
  const bin = path.join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "elm.cmd" : "elm");
  if (!fs.existsSync(bin)) {
    throw new Error("Elm compiler not found. Run `npm install` first.");
  }
  return bin;
}

function cleanApp() {
  fs.rmSync(APP, { recursive: true, force: true });
  fs.mkdirSync(path.join(APP, "static"), { recursive: true });
}

function copyStatic() {
  fs.cpSync(path.join(ROOT, "src", "static"), path.join(APP, "static"), { recursive: true });

  const htmlDir = path.join(ROOT, "src", "electron", "html");
  for (const name of fs.readdirSync(htmlDir)) {
    fs.copyFileSync(path.join(htmlDir, name), path.join(APP, "static", name));
  }
}

function copyMain() {
  for (const file of MAIN_FILES) {
    const from = path.join(ROOT, "src", "electron", file);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(APP, file));
    // Fail fast on syntax errors before the app is packaged.
    execFileSync(process.execPath, ["--check", path.join(APP, file)], { stdio: "inherit" });
  }
  for (const file of PRELOAD_FILES) {
    const from = path.join(ROOT, "src", "electron", file);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(APP, file));
    execFileSync(process.execPath, ["--check", path.join(APP, file)], { stdio: "inherit" });
  }

  // Runtime build-time config (support addresses etc.).
  fs.copyFileSync(path.join(ROOT, "config.js"), path.join(APP, "config.js"));
}

function compileElm() {
  const elmBin = elmCommand();
  const replacements = buildReplacements();
  let total = 0;

  for (const [input, output] of ELM_ENTRIES) {
    const outPath = path.join(STATIC, output);
    process.stdout.write(`\n[elm] ${input} -> ${output}\n`);
    execFileSync(
      elmBin,
      ["make", input, `--output=${outPath}`, "--optimize"],
      { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }
    );

    const code = fs.readFileSync(outPath, "utf-8");
    const translated = applyTranslations(code, replacements);
    const missing = findUnreplaced(translated);
    if (missing.length > 0) {
      throw new Error(
        `Unreplaced translation placeholders in ${output}: ${[...new Set(missing)].slice(0, 10).join(", ")}`
      );
    }
    fs.writeFileSync(outPath, translated);
    total += translated.length;
  }

  process.stdout.write(`\n[elm] ${ELM_ENTRIES.length} bundles, ${(total / 1024 / 1024).toFixed(2)} MiB\n`);
}

async function bundleRenderers() {
  await esbuild.build({
    entryPoints: RENDERER_ENTRIES,
    outdir: STATIC,
    bundle: true,
    platform: "browser",
    format: "iife",
    target: ["chrome128"],
    minify: true,
    sourcemap: false,
    logLevel: "info",
    define: {
      "process.env.NODE_ENV": '"production"'
    }
  });
}

async function main() {
  console.log(`[build] root: ${ROOT}`);
  cleanApp();
  copyStatic();
  copyMain();
  compileElm();
  await bundleRenderers();

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
  fs.writeFileSync(
    path.join(APP, "build-info.json"),
    JSON.stringify({ name: pkg.productName, version: pkg.version, builtAt: new Date().toISOString() }, null, 2)
  );

  console.log("\n[build] done ->", APP);
}

main().catch((error) => {
  console.error("\n[build] failed:", error.message);
  if (error.stdout) console.error(error.stdout.toString());
  if (error.stderr) console.error(error.stderr.toString());
  process.exit(1);
});
