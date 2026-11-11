"use strict";

const { app } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const run = promisify(execFile);

function pandocBinary() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "bin", "pandoc");
  }
  if (process.platform === "darwin") return path.join(__dirname, "..", "src", "bin", "mac", "pandoc");
  if (process.platform === "win32") return path.join(__dirname, "..", "src", "bin", "win", "pandoc.exe");
  return path.join(__dirname, "..", "src", "bin", "linux", "pandoc");
}

/**
 * Converts Markdown to DOCX with the bundled pandoc binary.
 *
 * @param {string} targetPath
 * @param {string} content
 */
async function exportDocx(targetPath, content) {
  const tmpMarkdown = path.join(app.getPath("temp"), `${path.basename(targetPath)}-${process.pid}.md`);
  await fs.writeFile(tmpMarkdown, content, "utf-8");

  try {
    await run(pandocBinary(), [
      tmpMarkdown,
      "--from=gfm+hard_line_breaks",
      "--to=docx",
      `--output=${targetPath}`,
      "--verbose"
    ]);
  } finally {
    await fs.unlink(tmpMarkdown).catch(() => {});
  }
}

module.exports = exportDocx;
module.exports.exportDocx = exportDocx;
module.exports.default = exportDocx;
