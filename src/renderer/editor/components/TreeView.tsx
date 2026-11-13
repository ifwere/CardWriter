// The column layout (`Page.Doc.treeView` / `viewColumn` / `viewGroup`).
//
// One column per depth level; each column is a list of groups, and a group is
// the children of one card in the previous column. Empty groups are kept so
// columns stay aligned. The root column is dropped: the root card is not shown.

import { useMemo } from "react";

import { getAncestors, getColumns, type Column } from "../model/treeView.ts";
import { getDescendants } from "../model/treeOps.ts";
import type { Tree } from "../model/tree.ts";
import { useDocument } from "../state/documentStore.ts";
import { Card, Fillet } from "./Card.tsx";

/** Filters columns by the search term (`treeView`'s `searchFilter`). */
function filterColumns(columns: Column[], term: string | null): Column[] {
  if (!term) return columns;
  const needle = term.toLowerCase();
  return columns.map((column) =>
    column.map((group) => group.filter((card) => card.content.toLowerCase().includes(needle)))
  );
}

interface GroupProps {
  cards: Tree[];
  active: string;
  editing: boolean;
  ancestorIds: string[];
  isActiveDescendant: boolean;
  dragging: string | null;
  language: string;
}

function Group({
  cards,
  active,
  editing,
  ancestorIds,
  isActiveDescendant,
  dragging,
  language
}: GroupProps) {
  const hasActive = cards.some((card) => card.id === active);
  const lastId = cards[cards.length - 1]?.id;

  return (
    <div
      className={`group${hasActive ? " has-active" : ""}${
        isActiveDescendant ? " active-descendant" : ""
      }`}
    >
      {cards.map((card) => (
        <Card
          key={card.id}
          card={card}
          isActive={card.id === active}
          isEditing={editing && card.id === active}
          isAncestor={ancestorIds.includes(card.id)}
          isLast={card.id === lastId}
          isDragging={Boolean(dragging)}
          language={language}
        />
      ))}
      {isActiveDescendant ? (
        <>
          <Fillet position="top-left" />
          <Fillet position="bottom-left" />
          <Fillet position="top-right" />
          <Fillet position="bottom-right" />
        </>
      ) : null}
    </div>
  );
}

export function TreeView() {
  const tree = useDocument((state) => state.tree);
  const active = useDocument((state) => state.active);
  const viewMode = useDocument((state) => state.viewMode);
  const searchField = useDocument((state) => state.searchField);
  const dragging = useDocument((state) => state.dragging);
  const language = useDocument((state) => state.language);

  const columns = useMemo(
    () => filterColumns(getColumns([[[tree]]]), searchField).slice(1),
    [tree, searchField]
  );

  const ancestorIds = useMemo(
    () => getAncestors(tree, findCard(tree, active) ?? tree).map((card) => card.id),
    [tree, active]
  );

  // `ViewState.descendants` in the Elm model: every card below the active one.
  const descendantIds = useMemo(() => {
    const activeCard = findCard(tree, active);
    return activeCard ? getDescendants(activeCard).map((card) => card.id) : [];
  }, [tree, active]);

  return (
    <div id="document">
      <div className="left-padding-column" />
      <div id="column-container">
        {columns.map((column, index) => (
          <div className="column" key={index}>
            <div className="buffer" />
            {column.map((group, groupIndex) => {
              const firstChild = group[0]?.id;
              return (
                <Group
                  key={firstChild ?? `empty-${index}-${groupIndex}`}
                  cards={group}
                  active={active}
                  editing={viewMode === "editing"}
                  ancestorIds={ancestorIds}
                  isActiveDescendant={
                    Boolean(firstChild) && descendantIds.includes(firstChild as string)
                  }
                  dragging={dragging}
                  language={language}
                />
              );
            })}
            <div className="buffer" />
          </div>
        ))}
      </div>
      <div className="right-padding-column" />
    </div>
  );
}

function findCard(tree: Tree, id: string): Tree | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findCard(child, id);
    if (found) return found;
  }
  return undefined;
}

