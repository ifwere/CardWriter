"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ensureDirSync, writeFileAtomicSync } = require("./util");

/**
 * Small persistent JSON key/value store.
 *
 * Top-level keys are used verbatim (document file paths, "recentDocuments",
 * "language", ...), so dot-notation is intentionally not supported.
 */
class Store {
  /**
   * @param {string} filePath
   * @param {Record<string, unknown>} [defaults]
   */
  constructor(filePath, defaults = {}) {
    this.filePath = filePath;
    this.data = { ...defaults };
    this.loaded = false;
  }

  load() {
    if (this.loaded) return this;
    this.loaded = true;
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        this.data = { ...this.data, ...parsed };
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("[store] could not read", this.filePath, error.message);
      }
    }
    return this;
  }

  /** @param {string} key @param {unknown} [fallback] */
  get(key, fallback) {
    this.load();
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  /** @param {string} key @param {unknown} value */
  set(key, value) {
    this.load();
    this.data[key] = value;
    this.flush();
  }

  /** @param {string} key */
  delete(key) {
    this.load();
    delete this.data[key];
    this.flush();
  }

  flush() {
    ensureDirSync(path.dirname(this.filePath));
    writeFileAtomicSync(this.filePath, JSON.stringify(this.data, null, 2));
  }
}

module.exports = Store;
