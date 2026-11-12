// Tree transformation tests, mirroring `Doc.TreeStructure` semantics.

import test from "node:test";
import assert from "node:assert/strict";

import { makeTree } from "../../src/renderer/editor/model/tree.ts";
import {
  applyTreeCommand,
  getDescendants,
  getIndex,
  getParent,
  getSiblings,
  getTree,
  insertSubtree,
  labelTree,
  mergeTrees,
  modifyChildren,
  modifySiblings,
  modifyTree,
  moveSubtree,
  preorderTraversal,
  pruneSubtree,
  splitAbove,
  splitBelow,
  splitRight
} from "../../src/renderer/editor/model/treeOps.ts";

function fixture() {
  return makeTree("0", "", [
    makeTree("1", "A", [makeTree("3", "C")]),
    makeTree("2", "B")
  ]);
}

test("looks up nodes, parents, siblings and indexes", () => {
  const tree = fixture();

  assert.equal(getTree("3", tree)?.content, "C");
  assert.equal(getTree("missing", tree), undefined);

  assert.equal(getParent("3", tree)?.id, "1");
  assert.equal(getParent("2", tree)?.id, "0");
  assert.equal(getParent("0", tree), undefined);

  assert.deepEqual(
    getSiblings("3", tree).map((node) => node.id),
    ["3"]
  );
  assert.deepEqual(
    getSiblings("2", tree).map((node) => node.id),
    ["1", "2"]
  );
  assert.deepEqual(getSiblings("missing", tree), []);

  assert.equal(getIndex("2", tree), 1);
  assert.equal(getIndex("3", tree), 0);
  assert.equal(getIndex("missing", tree), undefined);
});

test("inserts at any position and clamps indexes past the end", () => {
  const tree = fixture();
  const insertedFirst = insertSubtree(makeTree("4", "D"), "1", 0, tree);
  assert.deepEqual(
    getTree("1", insertedFirst)?.children.map((node) => node.id),
    ["4", "3"]
  );

  const appended = insertSubtree(makeTree("5", "E"), "0", 99, tree);
  assert.deepEqual(
    appended.children.map((node) => node.id),
    ["1", "2", "5"]
  );

  // The original tree is untouched.
  assert.deepEqual(tree, fixture());
});

test("removes a subtree and never removes the root", () => {
  const tree = fixture();
  const pruned = pruneSubtree("1", tree);
  assert.deepEqual(pruned.children.map((node) => node.id), ["2"]);
  assert.equal(getTree("3", pruned), undefined);

  assert.deepEqual(pruneSubtree("0", tree), fixture());
});

test("updates content by id", () => {
  const tree = fixture();
  const updated = modifyTree("3", (node) => ({ ...node, content: "new" }), tree);
  assert.equal(getTree("3", updated)?.content, "new");
  assert.equal(getTree("3", tree)?.content, "C");
});

test("modifies children and siblings", () => {
  const tree = fixture();
  const reordered = modifyChildren("1", (children) => children.reverse(), tree);
  assert.equal(getTree("1", reordered)?.children[0].id, "3");

  const filtered = modifySiblings("2", (children) => children.filter((node) => node.id !== "1"), tree);
  assert.deepEqual(filtered.children.map((node) => node.id), ["2"]);

  // Unknown ids leave the tree structurally unchanged.
  assert.deepEqual(modifyChildren("missing", (children) => children, tree), tree);
  assert.deepEqual(modifySiblings("missing", (children) => children, tree), tree);
});

test("moves a subtree between parents", () => {
  const tree = fixture();
  const grandchild = getTree("3", tree);
  assert.ok(grandchild);

  const moved = moveSubtree(grandchild, "0", 1, tree);
  assert.deepEqual(moved.children.map((node) => node.id), ["1", "3", "2"]);
  assert.deepEqual(getTree("1", moved)?.children, []);
});

test("moves a subtree within its parent", () => {
  const tree = fixture();
  const second = getTree("2", tree);
  assert.ok(second);

  const moved = moveSubtree(second, "0", 0, tree);
  assert.deepEqual(moved.children.map((node) => node.id), ["2", "1"]);
});

test("merges cards in both directions", () => {
  const tree = fixture();
  const from = getTree("2", tree);
  const to = getTree("1", tree);
  assert.ok(from && to);

  const down = mergeTrees(from, to, false, tree);
  assert.equal(getTree("1", down)?.content, "B\n\nA");
  assert.deepEqual(down.children.map((node) => node.id), ["1"]);
  assert.deepEqual(
    getTree("1", down)?.children.map((node) => node.id),
    ["3"]
  );

  const up = mergeTrees(from, to, true, tree);
  assert.equal(getTree("1", up)?.content, "A\n\nB");
});

test("applies editor commands", () => {
  const tree = fixture();

  const inserted = applyTreeCommand(
    { kind: "insert", id: "4", content: "D", parentId: "0", index: 0 },
    tree
  );
  assert.deepEqual(inserted.children.map((node) => node.id), ["4", "1", "2"]);

  const updated = applyTreeCommand({ kind: "update", id: "2", content: "B2" }, tree);
  assert.equal(getTree("2", updated)?.content, "B2");

  const removed = applyTreeCommand({ kind: "remove", id: "3" }, tree);
  assert.deepEqual(getTree("1", removed)?.children, []);

  const pasted = applyTreeCommand(
    { kind: "paste", tree: makeTree("9", "P"), parentId: "2", index: 0 },
    tree
  );
  assert.equal(getTree("9", pasted)?.content, "P");

  const merged = applyTreeCommand(
    { kind: "merge", from: getTree("2", tree), to: getTree("1", tree), reversed: false },
    tree
  );
  assert.equal(getTree("1", merged)?.content, "B\n\nA");
});

test("splits a card below, above and to the right", () => {
  const tree = fixture();

  const below = splitBelow("1", "new", "before", "after", tree);
  assert.equal(getTree("1", below)?.content, "before");
  assert.deepEqual(below.children.map((node) => node.id), ["1", "new", "2"]);
  assert.equal(getTree("new", below)?.content, "after");
  assert.deepEqual(
    getTree("1", below)?.children.map((node) => node.id),
    ["3"]
  );

  const above = splitAbove("1", "new", "before", "after", tree);
  assert.equal(getTree("1", above)?.content, "after");
  assert.deepEqual(above.children.map((node) => node.id), ["new", "1", "2"]);
  assert.equal(getTree("new", above)?.content, "before");

  const right = splitRight("1", "new", "before", "after", tree);
  assert.equal(getTree("1", right)?.content, "before");
  assert.deepEqual(
    getTree("1", right)?.children.map((node) => node.id),
    ["3", "new"]
  );
  assert.equal(getTree("new", right)?.content, "after");
});

test("splitting the root only updates its content", () => {
  const tree = fixture();
  assert.equal(getTree("0", splitBelow("0", "new", "x", "y", tree))?.content, "x");
  assert.equal(getTree("0", splitAbove("0", "new", "x", "y", tree))?.content, "y");
});

test("labels trees using parent and index", () => {
  const labeled = labelTree(0, "0", makeTree("root", "R", [makeTree("x", "X", [makeTree("y", "Y")])]));
  assert.equal(labeled.id, "0.0");
  assert.equal(labeled.children[0].id, "0.0.0");
  assert.equal(labeled.children[0].children[0].id, "0.0.0.0");
});

test("walks trees in preorder and lists descendants", () => {
  const tree = fixture();
  assert.deepEqual(preorderTraversal(tree), ["0", "1", "3", "2"]);
  assert.deepEqual(
    getDescendants(tree).map((node) => node.id),
    ["1", "3", "2"]
  );
  assert.deepEqual(getDescendants(makeTree("x", "")), []);
});
