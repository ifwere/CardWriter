// Tests for the JSON document importer (`import-single.js`), the replacement
// for the Elm worker.
//
// The importer renumbers node ids with a fresh random salt, so the tests assert
// on shape (nested `<gingko-card>` outline, unique `node-` ids, content) rather
// than on exact ids.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { importSingle: imp } = require("../../src/electron/import-single.js");

test("imports a flat list of cards", () => {
  const out = imp('[{"content":"One"},{"content":"Two"}]');
  const cards = [...out.matchAll(/<gingko-card id="([^"]+)">/g)];
  assert.equal(cards.length, 2);
  const ids = cards.map((m) => m[1]);
  assert.ok(ids.every((id) => /^node-[0-9A-F]{40}$/.test(id)), ids.join(","));
  assert.equal(new Set(ids).size, 2, "ids must be unique");
  assert.match(out, /One/);
  assert.match(out, /Two/);
});

test("imports nested children with the canonical outline", () => {
  const out = imp(
    '[{"content":"Root","children":[{"content":"A"},{"content":"B","children":[{"content":"C"}]}]}]'
  );
  // Root's own card plus A, B and C -> four cards, all distinct nested ids.
  const ids = [...out.matchAll(/<gingko-card id="([^"]+)">/g)].map((m) => m[1]);
  assert.equal(ids.length, 4);
  assert.equal(new Set(ids).size, 4, "nested ids must be unique");
  assert.ok(ids.every((id) => /^node-[0-9A-F]{40}$/.test(id)), ids.join(","));

  // Every open tag is matched by a close tag.
  assert.equal((out.match(/<gingko-card/g) || []).length, 4);
  assert.equal((out.match(/<\/gingko-card>/g) || []).length, 4);
});

test("omits an implicit root: top-level cards become siblings", () => {
  // treeToMarkdownOutline(false, ...) joins top-level children with "\n" and
  // no wrapping root tag: exactly one card per top-level child.
  const out = imp('[{"content":"A"},{"content":"B"}]');
  assert.equal((out.match(/<gingko-card/g) || []).length, 2);
  assert.equal((out.match(/<\/gingko-card>/g) || []).length, 2);
  const ids = [...out.matchAll(/<gingko-card id="([^"]+)">/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, 2);
});

test("a card without children still renders an empty nested section", () => {
  const out = imp('[{"content":"Only"}]');
  assert.match(out, /<gingko-card id="[^"]+">/);
  assert.match(out, />\n\nOnly\n\n/);
});

test("rejects invalid inputs with a readable error", () => {
  assert.throws(() => imp("not json"), /Not valid JSON/);
  assert.throws(() => imp('[{"content":5}]'), /content/);
  assert.throws(() => imp('[{"content":"x","children":"no"}]'), /children/);
  assert.throws(() => imp('{"content":"object not array"}'), /array/);
});

test("imports two documents independently (fresh salt each time)", () => {
  const a = imp('[{"content":"X"}]');
  const b = imp('[{"content":"X"}]');
  const idA = a.match(/<gingko-card id="([^"]+)">/)[1];
  const idB = b.match(/<gingko-card id="([^"]+)">/)[1];
  // Random salt makes distinct ids overwhelmingly likely.
  assert.notEqual(idA, idB);
});