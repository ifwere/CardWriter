import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { debounce, groupBy, omit, filenamifyPath, versionDirName } = require("../../src/electron/util.js");

test("groupBy mirrors lodash for string keys", () => {
  const items = [
    { type: "tree", id: 1 },
    { type: "commit", id: 2 },
    { type: "tree", id: 3 }
  ];
  const grouped = groupBy(items, (item) => item.type);
  assert.deepEqual(Object.keys(grouped).sort(), ["commit", "tree"]);
  assert.equal(grouped.tree.length, 2);
  assert.equal(grouped.commit[0].id, 2);
});

test("omit drops only the requested keys", () => {
  assert.deepEqual(omit({ _id: "a", type: "tree", content: "x" }, ["_id"]), {
    type: "tree",
    content: "x"
  });
});

test("filenamifyPath keeps separators and replaces hostile characters", () => {
  const input = path.join("a", "b:c", "d*e.gkw");
  const safe = filenamifyPath(input);
  assert.equal(safe.includes(":"), false);
  assert.equal(safe.includes("*"), false);
  assert.equal(safe.split(path.sep).length, input.split(path.sep).length);
});

test("versionDirName is stable and distinguishes documents", () => {
  const a = versionDirName("/Users/me/Documents/novel.gkw");
  const b = versionDirName("/Users/me/Documents/novel.gkw");
  const c = versionDirName("/Users/me/Documents/novel2.gkw");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^novel\.gkw-[0-9a-f]{12}$/);
});

test("debounce fires once for a burst", async () => {
  let calls = 0;
  const fn = debounce(() => {
    calls += 1;
  }, 10);
  fn();
  fn();
  fn();
  assert.equal(calls, 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 1);
});

test("debounce supports a leading call", async () => {
  let calls = 0;
  const fn = debounce(() => {
    calls += 1;
  }, 10, { leading: true, trailing: false });
  fn();
  assert.equal(calls, 1);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(calls, 1);
});
