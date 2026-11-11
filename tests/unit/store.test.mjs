import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Store = require("../../src/electron/store.js");

function tempStorePath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cardwriter-store-"));
  return path.join(dir, "settings.json");
}

test("stores values and persists them", () => {
  const file = tempStorePath();
  const store = new Store(file);
  store.set("recentDocuments", [{ path: "/a.gkw" }]);
  store.set("/a.gkw", { "last-actives": ["1", "2"] });

  const reloaded = new Store(file);
  assert.deepEqual(reloaded.get("recentDocuments"), [{ path: "/a.gkw" }]);
  assert.deepEqual(reloaded.get("/a.gkw"), { "last-actives": ["1", "2"] });
  assert.equal(reloaded.get("missing", "fallback"), "fallback");
});

test("treats dotted keys literally", () => {
  const file = tempStorePath();
  const store = new Store(file);
  store.set("a.b", 1);
  assert.equal(store.get("a.b"), 1);
  assert.deepEqual(Object.keys(store.data), ["a.b"]);
});

test("ignores a corrupt settings file instead of crashing", () => {
  const file = tempStorePath();
  fs.writeFileSync(file, "{not json");
  const store = new Store(file);
  assert.equal(store.get("anything", 42), 42);
  store.set("ok", true);
  assert.equal(new Store(file).get("ok"), true);
});
