"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

/**
 * Trailing-edge debounce with an optional leading call.
 *
 * @param {(...args: any[]) => void} fn
 * @param {number} wait
 * @param {{ leading?: boolean, trailing?: boolean }} [options]
 */
function debounce(fn, wait, options = {}) {
  const leading = options.leading === true;
  const trailing = options.trailing !== false;
  let timer = null;
  let lastArgs = null;

  function invoke() {
    const args = lastArgs;
    lastArgs = null;
    timer = null;
    fn(...args);
  }

  const debounced = (...args) => {
    lastArgs = args;
    if (leading && timer === null) {
      fn(...args);
      lastArgs = null;
    }
    if (trailing) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        if (lastArgs) invoke();
        else timer = null;
      }, wait);
    }
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    lastArgs = null;
  };

  /** Runs a pending trailing call immediately. */
  debounced.flush = () => {
    if (timer !== null && lastArgs) {
      clearTimeout(timer);
      const args = lastArgs;
      timer = null;
      lastArgs = null;
      fn(...args);
    }
  };

  return debounced;
}

/**
 * Groups objects by `keyFn`. Mirrors lodash.groupBy for the shapes used here.
 *
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string} keyFn
 * @returns {Record<string, T[]>}
 */
function groupBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = [];
    out[key].push(item);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} object
 * @param {string[]} keys
 */
function omit(object, keys) {
  const out = { ...object };
  for (const key of keys) delete out[key];
  return out;
}

/**
 * Replaces path-hostile characters, preserving directory separators.
 * Used to derive per-document version-history folders.
 *
 * @param {string} filePath
 * @param {string} [replacement]
 */
function filenamifyPath(filePath, replacement = "%") {
  return filePath
    .split(/[\\/]+/)
    .map((segment) => segment.replace(/[<>:"|?*\x00-\x1f%]/g, replacement))
    .join(path.sep);
}

/**
 * Stable, filesystem-safe folder name for a document's version history.
 *
 * @param {string} filePath
 */
function versionDirName(filePath) {
  const resolved = path.resolve(filePath);
  const base = path.basename(resolved).replace(/[<>:"/\\|?*\x00-\x1f%]/g, "%");
  const hash = crypto.createHash("sha1").update(resolved).digest("hex").slice(0, 12);
  return `${base}-${hash}`;
}

/** @param {string} dir */
function ensureDirSync(dir) {
  require("node:fs").mkdirSync(dir, { recursive: true });
}

/**
 * Writes a file atomically (write sibling temp file, then rename).
 *
 * @param {string} filePath
 * @param {string} contents
 */
function writeFileAtomicSync(filePath, contents) {
  const fs = require("node:fs");
  ensureDirSync(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

module.exports = {
  debounce,
  groupBy,
  omit,
  filenamifyPath,
  versionDirName,
  ensureDirSync,
  writeFileAtomicSync
};
