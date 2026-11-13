// Column layout and navigation helpers.
//
// Port of the layout-facing half of `Doc.TreeUtils`. A document is displayed
// as one column per depth level; each column is a list of groups, where a
// group is the children of one card in the previous column. Cards that have no
// children still occupy a group so the columns stay aligned.

import type { Tree } from "./tree.ts";
import {
  getChildren,
  getDescendants,
  getParent,
  getSiblings,
  preorderTraversal
} from "./treeOps.ts";

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

/* ================= Ancestors and scroll targets ================= */

/** Root-first path of ancestors, excluding the card itself (`getAncestors`). */
export function getAncestors(all: Tree, target: Tree): Tree[] {
  const ancestors: Tree[] = [];
  let current = getParent(target.id, all);
  while (current) {
    ancestors.unshift(current);
    current = getParent(current.id, all);
  }
  return ancestors;
}

export type ScrollPosition =
  | { position: "Center"; target: string }
  | { position: "Before"; target: string }
  | { position: "After"; target: string }
  | { position: "Between"; target: string; target2: string }
  | { position: "None" };

export interface ColumnScroll {
  columnIdx: number;
  scrollData: ScrollPosition;
}

function sortChildrenBy(trees: Tree[], score: (tree: Tree) => number): Tree[] {
  return trees
    .map((tree) => ({ tree, key: score(tree) }))
    .sort((a, b) => a.key - b.key)
    .map(({ tree }) => ({ ...tree, children: sortChildrenBy(tree.children, score) }));
}

function findId(ids: string[], id: string): string | undefined {
  return ids.includes(id) ? id : undefined;
}

/**
 * Target card per column when the active card changes (`getScrollPositions`).
 *
 * Columns are searched in priority order: the active card itself, then an
 * ancestor, then the most recently active descendant, then any descendant,
 * then the surrounding cards. The root column is dropped.
 */
export function getScrollPositions(
  activeTree: Tree,
  activePastIds: string[],
  fullTree: Tree
): ColumnScroll[] {
  const ancestorIds = getAncestors(fullTree, activeTree).map((tree) => tree.id);
  const descendantIds = getDescendants(activeTree).map((tree) => tree.id);

  const score = (tree: Tree): number => {
    const index = activePastIds.indexOf(tree.id);
    return index === -1 ? 9999 : index;
  };

  const historyOrder = getColumns([[[sortChildrenBy([fullTree], score)[0]]]])
    .map((column) => column.flat().map((card) => card.id))
    .flat()
    .filter((id) => descendantIds.includes(id));

  const preordered = preorderTraversal(fullTree);
  const activeIndex = Math.max(preordered.indexOf(activeTree.id), 0);

  const exclude = (ids: string[], list: string[]) => list.filter((id) => !ids.includes(id));
  const afterIds = exclude(
    [...descendantIds, ...ancestorIds, activeTree.id],
    preordered.slice(activeIndex + 1)
  );
  const beforeIds = exclude(
    [...descendantIds, ...ancestorIds, activeTree.id],
    preordered.slice(0, activeIndex)
  );

  const flatColumns = getColumns([[[fullTree]]]).map((column) =>
    column.flat().map((card) => card.id)
  );

  const firstMatch = (ids: string[], column: string[]): string | undefined =>
    column.find((id) => ids.includes(id));

  return flatColumns.slice(1).map((column, index) => {
    const center =
      findId(column, activeTree.id) ??
      firstMatch(ancestorIds, column) ??
      firstMatch(historyOrder, column) ??
      firstMatch(descendantIds, column);

    if (center) {
      return { columnIdx: index + 1, scrollData: { position: "Center", target: center } };
    }

    const before = firstMatch(beforeIds, column);
    const after = firstMatch(afterIds, [...column].reverse());

    if (after && before) {
      return {
        columnIdx: index + 1,
        scrollData: { position: "Between", target: after, target2: before }
      };
    }
    if (before) {
      return { columnIdx: index + 1, scrollData: { position: "Before", target: before } };
    }
    if (after) {
      return { columnIdx: index + 1, scrollData: { position: "After", target: after } };
    }
    return { columnIdx: index + 1, scrollData: { position: "None" } };
  });
}
