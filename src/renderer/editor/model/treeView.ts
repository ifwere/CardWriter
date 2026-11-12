// Column layout and navigation helpers.
//
// Port of the layout-facing half of `Doc.TreeUtils`. A document is displayed
// as one column per depth level; each column is a list of groups, where a
// group is the children of one card in the previous column. Cards that have no
// children still occupy a group so the columns stay aligned.

import type { Tree } from "./tree.ts";
import { getChildren, getSiblings } from "./treeOps.ts";

/** One column: the child groups of every card in the previous column. */
export type Column = Tree[][];

export function getColumns(columns: Column[]): Column[] {
  const lastColumn = columns.length > 0 ? columns[columns.length - 1] : [[]];
  const cards = lastColumn.flat();
  const hasChildren = cards.some((card) => getChildren(card).length > 0);

  if (!hasChildren) return columns;
  return getColumns([...columns, cards.map((card) => getChildren(card))]);
}

export function getColumn(index: number, tree: Tree): Column | undefined {
  return getColumns([[[tree]]])[index];
}

/** Depth of a card, where the root has depth 0. Unknown ids also give 0. */
export function getDepth(previous: number, tree: Tree, id: string): number {
  if (tree.id === id) return previous;

  const children = getChildren(tree);
  if (children.length === 0) return 0;

  return Math.max(...children.map((child) => getDepth(previous + 1, child, id)));
}

export function getColumnById(id: string, tree: Tree): Column | undefined {
  return getColumn(getDepth(0, tree, id), tree);
}

export function getContent(id: string, tree: Tree): string {
  const found = findById(tree, id);
  return found ? found.content : "";
}

function findById(tree: Tree, id: string): Tree | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Previous/next sibling. */
export function getPrevNext(shift: number, id: string, tree: Tree): Tree | undefined {
  const siblings = getSiblings(id, tree);
  const index = siblings.findIndex((sibling) => sibling.id === id);
  if (index === -1) return undefined;
  return siblings[index + shift];
}

export function getPrev(id: string, tree: Tree): Tree | undefined {
  return getPrevNext(-1, id, tree);
}

export function getNext(id: string, tree: Tree): Tree | undefined {
  return getPrevNext(1, id, tree);
}

/** Previous/next card in the same column (flattened across groups). */
export function getPrevNextInColumn(shift: number, id: string, tree: Tree): Tree | undefined {
  const column = getColumnById(id, tree);
  if (!column) return undefined;

  const cards = column.flat();
  const index = cards.findIndex((card) => card.id === id);
  if (index === -1) return undefined;
  return cards[index + shift];
}

export function getPrevInColumn(id: string, tree: Tree): Tree | undefined {
  return getPrevNextInColumn(-1, id, tree);
}

export function getNextInColumn(id: string, tree: Tree): Tree | undefined {
  return getPrevNextInColumn(1, id, tree);
}

export function getFirstInColumn(id: string, tree: Tree): string {
  const column = getColumnById(id, tree);
  if (!column) return id;
  const first = column.flat()[0];
  return first ? first.id : id;
}

export function getLastInColumn(id: string, tree: Tree): string {
  const column = getColumnById(id, tree);
  if (!column) return id;
  const cards = column.flat();
  const last = cards[cards.length - 1];
  return last ? last.id : id;
}

export function getFirstCard(tree: Tree): Tree | undefined {
  return getChildren(tree)[0];
}
