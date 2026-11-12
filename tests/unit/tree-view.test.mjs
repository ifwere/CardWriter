// Column layout and navigation tests, mirroring `Doc.TreeUtils`.

import test from "node:test";
import assert from "node:assert/strict";

import { makeTree } from "../../src/renderer/editor/model/tree.ts";
import {
  getColumn,
  getColumnById,
  getColumns,
  getContent,
  getDepth,
  getFirstCard,
  getFirstInColumn,
  getLastInColumn,
  getNext,
  getNextInColumn,
  getPrev,
  getPrevInColumn
} from "../../src/renderer/editor/model/treeView.ts";

function fixture() {
  return makeTree("0", "Root", [
    makeTree("1", "A", [makeTree("3", "C")]),
    makeTree("2", "B")
  ]);
}

test("builds one column per depth level", () => {
  const tree = fixture();
  const columns = getColumns([[[tree]]]);

  assert.equal(columns.length, 3);
  assert.deepEqual(
    columns[0].flat().map((node) => node.id),
    ["0"]
  );
  assert.deepEqual(
    columns[1].flat().map((node) => node.id),
    ["1", "2"]
  );
  assert.deepEqual(
    columns[2].map((group) => group.map((node) => node.id)),
    [["3"], []]
  );
});

test("stops at the deepest column", () => {
  const tree = makeTree("0", "", [makeTree("1", "")]);
  assert.equal(getColumns([[[tree]]]).length, 2);
});

test("gets a column by index and by card id", () => {
  const tree = fixture();

  assert.deepEqual(
    getColumn(1, tree)?.flat().map((node) => node.id),
    ["1", "2"]
  );
  assert.equal(getColumn(9, tree), undefined);

  assert.equal(getDepth(0, tree, "0"), 0);
  assert.equal(getDepth(0, tree, "1"), 1);
  assert.equal(getDepth(0, tree, "3"), 2);
  assert.equal(getDepth(0, tree, "missing"), 0);

  assert.deepEqual(
    getColumnById("3", tree)?.flat().map((node) => node.id),
    ["3"]
  );
});

test("navigates siblings", () => {
  const tree = fixture();
  assert.equal(getPrev("2", tree)?.id, "1");
  assert.equal(getNext("1", tree)?.id, "2");
  assert.equal(getPrev("1", tree), undefined);
  assert.equal(getNext("2", tree), undefined);
});

test("navigates within a column", () => {
  const tree = fixture();
  assert.equal(getPrevInColumn("2", tree)?.id, "1");
  assert.equal(getNextInColumn("1", tree)?.id, "2");
  assert.equal(getPrevInColumn("3", tree), undefined);
  assert.equal(getNextInColumn("3", tree), undefined);
});

test("finds column edges", () => {
  const tree = fixture();
  assert.equal(getFirstInColumn("2", tree), "1");
  assert.equal(getLastInColumn("1", tree), "2");
  // Unknown ids resolve to depth 0, so the root column is returned.
  assert.equal(getFirstInColumn("missing", tree), "0");
  assert.equal(getLastInColumn("missing", tree), "0");
});

test("reads content and the first card", () => {
  const tree = fixture();
  assert.equal(getContent("3", tree), "C");
  assert.equal(getContent("missing", tree), "");
  assert.equal(getFirstCard(tree)?.id, "1");
  assert.equal(getFirstCard(makeTree("x", "")), undefined);
});
