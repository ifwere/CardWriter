import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VersionStore = require("../../src/electron/version-store.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cardwriter-version-"));
}

async function drain(db) {
  const entries = [];
  for await (const [key, value] of db.iterator()) entries.push([key, value]);
  return entries;
}

test("batch puts are readable through the iterator", async () => {
  const dir = tempDir();
  const db = new VersionStore(dir);
  await db.batch([
    { type: "put", key: "obj1", value: JSON.stringify({ type: "tree", content: "one" }) },
    { type: "put", key: "obj2", value: JSON.stringify({ type: "commit" }) }
  ]);

  const entries = await drain(db);
  assert.deepEqual(entries.map((entry) => entry[0]).sort(), ["obj1", "obj2"]);
  const obj1 = JSON.parse(entries.find((entry) => entry[0] === "obj1")[1]);
  assert.equal(obj1.content, "one");
  await db.close();
});

test("history survives reopening", async () => {
  const dir = tempDir();
  const first = new VersionStore(dir);
  await first.batch([{ type: "put", key: "k", value: "v1" }]);
  await first.close();

  const second = new VersionStore(dir);
  await second.batch([{ type: "put", key: "k", value: "v2" }]);
  const entries = await drain(second);
  assert.deepEqual(entries, [["k", "v2"]]);
  await second.close();
});

test("deletes are replayed", async () => {
  const dir = tempDir();
  const db = new VersionStore(dir);
  await db.batch([{ type: "put", key: "k", value: "v" }]);
  await db.batch([{ type: "del", key: "k" }]);
  assert.deepEqual(await drain(db), []);
  await db.close();
});

test("a torn trailing line from a crash is ignored", async () => {
  const dir = tempDir();
  const db = new VersionStore(dir);
  await db.batch([{ type: "put", key: "good", value: "1" }]);
  await db.close();

  fs.appendFileSync(path.join(dir, "objects.log"), '{"k":"bad","v":');

  const reopened = new VersionStore(dir);
  assert.deepEqual(await drain(reopened), [["good", "1"]]);
  await reopened.close();
});

test("closed stores reject writes", async () => {
  const db = new VersionStore(tempDir());
  await db.close();
  await assert.rejects(() => db.batch([{ type: "put", key: "k", value: "v" }]), /closed/);
});
