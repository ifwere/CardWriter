// Pure tree transformations used by the editor.
//
// Port of the `Doc.TreeStructure` commands (`Ins`, `Upd`, `Mov`, `Rmv`, `Mrg`,
// `Paste`) and the lookup helpers they rely on from `Doc.TreeUtils`. All
// functions return new trees and never mutate their inputs.

import type { Tree } from "./tree.ts";

export type TreeCommand =
  | { kind: "insert"; id: string; content: string; parentId: string; index: number }
  | { kind: "update"; id: string; content: string }
  | { kind: "move"; tree: Tree; parentId: string; index: number }
  | { kind: "remove"; id: string }
  | { kind: "merge"; from: Tree; to: Tree; reversed: boolean }
  | { kind: "paste"; tree: Tree; parentId: string; index: number };

export function getChildren(tree: Tree): Tree[] {
  return tree.children;
}

/** First node with the given id in document order. */
export function getTree(id: string, tree: Tree): Tree | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = getTree(id, child);
    if (found) return found;
  }
  return undefined;
}

/** Parent of the node with the given id. The root has no parent. */
export function getParent(id: string, tree: Tree): Tree | undefined {
  if (tree.children.some((child) => child.id === id)) return tree;
  for (const child of tree.children) {
    const found = getParent(id, child);
    if (found) return found;
  }
  return undefined;
}

/** Siblings of the node, including the node itself. */
export function getSiblings(id: string, tree: Tree): Tree[] {
  if (tree.children.some((child) => child.id === id)) return tree.children;
  for (const child of tree.children) {
    const found = getSiblings(id, child);
    if (found.length > 0) return found;
  }
  return [];
}

export function getIndex(id: string, tree: Tree): number | undefined {
  const index = getSiblings(id, tree).findIndex((sibling) => sibling.id === id);
  return index === -1 ? undefined : index;
}

/** Replaces the node with `id`, or returns an equivalent tree when absent. */
export function modifyTree(id: string, update: (tree: Tree) => Tree, tree: Tree): Tree {
  if (tree.id === id) return update(tree);
  return { ...tree, children: tree.children.map((child) => modifyTree(id, update, child)) };
}

export function modifyChildren(
  parentId: string,
  update: (children: Tree[]) => Tree[],
  tree: Tree
): Tree {
  if (tree.id === parentId) {
    return { ...tree, children: update(tree.children) };
  }
  return {
    ...tree,
    children: tree.children.map((child) => modifyChildren(parentId, update, child))
  };
}

export function modifySiblings(
  id: string,
  update: (children: Tree[]) => Tree[],
  tree: Tree
): Tree {
  const parent = getParent(id, tree);
  if (!parent) return tree;
  return modifyChildren(parent.id, update, tree);
}

/** Inserts at `index`; indexes past the end append. */
export function insertSubtree(
  subtree: Tree,
  parentId: string,
  index: number,
  tree: Tree
): Tree {
  return modifyChildren(
    parentId,
    (children) => [
      ...children.slice(0, index),
      subtree,
      ...children.slice(index)
    ],
    tree
  );
}

/** Removes the node with `id` and its whole subtree. The root is never removed. */
export function pruneSubtree(id: string, tree: Tree): Tree {
  return modifySiblings(id, (children) => children.filter((child) => child.id !== id), tree);
}

/**
 * Merges `from` into `to`, then removes `from`.
 *
 * `reversed` matches the Elm `Mrg` flag: when true the merged content puts
 * `from` after `to` (used by "merge up"); otherwise `from` comes first.
 */
export function mergeTrees(from: Tree, to: Tree, reversed: boolean, tree: Tree): Tree {
  const parts = reversed ? [to.content, from.content] : [from.content, to.content];
  const childGroups = reversed ? [to.children, from.children] : [from.children, to.children];
  const mergedContent = parts.join("\n\n");
  const mergedChildren = childGroups.flat();

  return modifyTree(
    to.id,
    (node) => ({ ...node, content: mergedContent, children: mergedChildren }),
    pruneSubtree(from.id, tree)
  );
}

export function moveSubtree(
  subtree: Tree,
  parentId: string,
  index: number,
  tree: Tree
): Tree {
  return insertSubtree(subtree, parentId, index, pruneSubtree(subtree.id, tree));
}

/** Applies one editor command to a tree. */
export function applyTreeCommand(command: TreeCommand, tree: Tree): Tree {
  switch (command.kind) {
    case "insert":
      return insertSubtree(
        { id: command.id, content: command.content, children: [] },
        command.parentId,
        command.index,
        tree
      );
    case "update":
      return modifyTree(command.id, (node) => ({ ...node, content: command.content }), tree);
    case "remove":
      return pruneSubtree(command.id, tree);
    case "move":
      return moveSubtree(command.tree, command.parentId, command.index, tree);
    case "merge":
      return mergeTrees(command.from, command.to, command.reversed, tree);
    case "paste":
      return insertSubtree(command.tree, command.parentId, command.index, tree);
  }
}

/* ================= Split at cursor ================= */

/**
 * `Ctrl/Cmd+J` while editing: the current card keeps the text before the
 * cursor and a new sibling below receives the text after it.
 */
export function splitBelow(
  id: string,
  newId: string,
  before: string,
  after: string,
  tree: Tree
): Tree {
  const parent = getParent(id, tree);
  const index = getIndex(id, tree);
  const updated = modifyTree(id, (node) => ({ ...node, content: before }), tree);
  if (!parent || index === undefined) return updated;
  return insertSubtree({ id: newId, content: after, children: [] }, parent.id, index + 1, updated);
}

/**
 * `Ctrl/Cmd+K` while editing: a new sibling above receives the text before the
 * cursor and the current card keeps the text after it.
 */
export function splitAbove(
  id: string,
  newId: string,
  before: string,
  after: string,
  tree: Tree
): Tree {
  const parent = getParent(id, tree);
  const index = getIndex(id, tree);
  const updated = modifyTree(id, (node) => ({ ...node, content: after }), tree);
  if (!parent || index === undefined) return updated;
  return insertSubtree({ id: newId, content: before, children: [] }, parent.id, index, updated);
}

/**
 * `Ctrl/Cmd+L` while editing: the current card keeps the text before the
 * cursor and a new child receives the text after it.
 */
export function splitRight(
  id: string,
  newId: string,
  before: string,
  after: string,
  tree: Tree
): Tree {
  const updated = modifyTree(id, (node) => ({ ...node, content: before }), tree);
  return insertSubtree(
    { id: newId, content: after, children: [] },
    id,
    Number.MAX_SAFE_INTEGER,
    updated
  );
}

/** Re-labels ids as `<parent>.<index>` (used by importers and tests). */
export function labelTree(index: number, parentId: string, tree: Tree): Tree {
  const id = `${parentId}.${index}`;
  return {
    id,
    content: tree.content,
    children: tree.children.map((child, childIndex) => labelTree(childIndex, id, child))
  };
}

/** Depth-first ids in preorder (`Doc.TreeUtils.preorderTraversal`). */
export function preorderTraversal(tree: Tree): string[] {
  return [tree.id, ...tree.children.flatMap(preorderTraversal)];
}

/** Leaves below a node, in document order. */
export function getDescendants(tree: Tree): Tree[] {
  if (tree.children.length === 0) return [];
  return tree.children.flatMap((child) => [child, ...getDescendants(child)]);
}

/** Cards without children, in document order (`Doc.TreeUtils.getLeaves`). */
export function getLeaves(tree: Tree, accum: Tree[] = []): Tree[] {
  if (tree.children.length === 0) return [...accum, tree];
  return tree.children.reduce((acc, child) => getLeaves(child, acc), accum);
}
