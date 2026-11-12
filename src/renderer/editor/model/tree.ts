// Core document tree shared by the editor and import/export code.
//
// Mirrors `Types.Tree` from the Elm sources: a card has a stable id, Markdown
// content and an ordered list of child cards. Documents can have several
// sibling roots (the Elm model wraps them in `Children`), so callers usually
// work with `Tree[]` rather than a single node.

export interface Tree {
  id: string;
  content: string;
  children: Tree[];
}

export function makeTree(id: string, content: string, children: Tree[] = []): Tree {
  return { id, content, children };
}

/** Depth-first walk in document order. */
export function walkTrees(trees: Tree[], visit: (tree: Tree) => void): void {
  for (const tree of trees) {
    visit(tree);
    walkTrees(tree.children, visit);
  }
}

/** Finds a node by id; ids are unique within a document. */
export function findTree(trees: Tree[], id: string): Tree | undefined {
  for (const tree of trees) {
    if (tree.id === id) return tree;
    const found = findTree(tree.children, id);
    if (found) return found;
  }
  return undefined;
}
