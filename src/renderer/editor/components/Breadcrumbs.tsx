// Ancestor trail shown above the columns (`Doc.UI.viewBreadcrumbs`).
//
// Each crumb is the card's first line, rendered as plain text: the Elm version
// parsed Markdown but only kept the first inline element, which for a title
// line is the text itself.

import { useMemo } from "react";

import type { Tree } from "../model/tree.ts";
import { cardTitle } from "../model/markdown.ts";
import { getAncestors } from "../model/treeView.ts";
import { useDocument } from "../state/documentStore.ts";

function findCard(tree: Tree, id: string): Tree | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findCard(child, id);
    if (found) return found;
  }
  return undefined;
}

export function Breadcrumbs() {
  const tree = useDocument((state) => state.tree);
  const active = useDocument((state) => state.active);
  const activate = useDocument((state) => state.activate);

  const crumbs = useMemo(() => {
    const card = findCard(tree, active);
    if (!card) return [];
    // The root is not a real card, so drop it from the trail.
    return [...getAncestors(tree, card), card]
      .filter((ancestor) => ancestor.id !== "0")
      .map((ancestor) => ({ id: ancestor.id, title: cardTitle(ancestor.content) }));
  }, [tree, active]);

  if (crumbs.length === 0) return null;

  return (
    <div id="breadcrumbs" data-private="lipsum">
      {crumbs.map((crumb) => (
        <div key={crumb.id} onClick={() => activate(crumb.id)}>
          <span>{crumb.title}</span>
        </div>
      ))}
    </div>
  );
}
