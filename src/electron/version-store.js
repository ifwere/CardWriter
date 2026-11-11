"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { ensureDirSync, writeFileAtomicSync } = require("./util");

const COMPACT_THRESHOLD_BYTES = 48 * 1024 * 1024;

/**
 * Append-only key/value store used for a document's version history.
 *
 * It reproduces the subset of the LevelDB API that the main process uses:
 *
 *   await db.batch([{ type: "put", key, value }, ...])
 *   for await (const [key, value] of db.iterator()) { ... }
 *   await db.close()
 *
 * Values are JSON strings, exactly as they were handed to LevelDB. Appending
 * instead of rewriting keeps checkpoints cheap: every autosave commits a
 * handful of immutable objects.
 */
class VersionStore {
  /** @param {string} dir */
  constructor(dir) {
    this.dir = dir;
    this.filePath = path.join(dir, "objects.log");
    /** @type {Map<string, string>} */
    this.map = new Map();
    this.closed = false;

    ensureDirSync(dir);
    this.#replay();
    this.#compactIfNeeded();
  }

  #replay() {
    let raw;
    try {
      raw = fs.readFileSync(this.filePath, "utf-8");
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }

    const lines = raw.split("\n");
    for (const line of lines) {
      if (!line) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        // A torn trailing write from a crash: everything after it is invalid.
        break;
      }
      if (!entry || typeof entry.k !== "string") continue;
      if (entry.d) this.map.delete(entry.k);
      else this.map.set(entry.k, String(entry.v));
    }
  }

  #compactIfNeeded() {
    let stats;
    try {
      stats = fs.statSync(this.filePath);
    } catch {
      return;
    }
    if (stats.size < COMPACT_THRESHOLD_BYTES) return;
    this.#writeCompacted();
  }

  #writeCompacted() {
    const lines = [];
    for (const [key, value] of this.map) {
      lines.push(JSON.stringify({ k: key, v: value }));
    }
    writeFileAtomicSync(this.filePath, lines.length ? lines.join("\n") + "\n" : "");
  }

  /**
   * @param {{ type: "put" | "del", key: string, value?: string }[]} ops
   */
  async batch(ops) {
    if (this.closed) throw new Error("VersionStore is closed");
    if (!ops.length) return;

    const lines = [];
    for (const op of ops) {
      if (op.type === "put") {
        this.map.set(op.key, String(op.value));
        lines.push(JSON.stringify({ k: op.key, v: String(op.value) }));
      } else if (op.type === "del") {
        this.map.delete(op.key);
        lines.push(JSON.stringify({ k: op.key, d: true }));
      }
    }
    fs.appendFileSync(this.filePath, lines.join("\n") + "\n");
  }

  async *iterator() {
    for (const [key, value] of this.map) {
      yield [key, value];
    }
  }

  async close() {
    this.closed = true;
  }
}

module.exports = VersionStore;
