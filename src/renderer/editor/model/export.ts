// Export payloads for the desktop export menu.
//
// Port of `Page.Doc.Export.toString` / `toExtension`. The renderer builds the
// string and hands `[extension, content]` to the main process, which shows the
// save dialog and runs pandoc for DOCX.

import type { Tree } from "./tree.ts";
import { makeTree } from "./tree.ts";
import { getLeaves } from "./treeOps.ts";
import { getColumnById } from "./treeView.ts";
import { treeToJSON, treeToMarkdownString, treeToOPML } from "./coders.ts";

export type ExportSelection = "everything" | "subtree" | "leaves" | "column";
export type ExportFormat = "docx" | "text" | "opml" | "json";

export function toExtension(format: ExportFormat): string {
  switch (format) {
    case "docx":
      return "docx";
    case "json":
      return "json";
    case "opml":
      return "opml";
    case "text":
      return "md";
  }
}

/** Serialized export for the given selection and format. */
export function exportToString(
  docName: string,
  selection: ExportSelection,
  format: ExportFormat,
  activeTree: Tree,
  fullTree: Tree
): string {
  const stringFor = (withRoot: boolean, tree: Tree): string => {
    switch (format) {
      case "json":
        return JSON.stringify(treeToJSON(withRoot, tree), null, 2);
      case "opml":
        return treeToOPML(docName, tree);
      default:
        return treeToMarkdownString(withRoot, tree);
    }
  };

  const columnCards = (getColumnById(activeTree.id, fullTree) ?? [])
    .flat()
    .map((card) => makeTree(card.id, card.content, []));

  switch (selection) {
    case "everything":
      return stringFor(false, fullTree);

    case "subtree":
      return stringFor(true, activeTree);

    case "leaves": {
      if (format === "json") {
        return JSON.stringify(treeToJSON(false, makeTree("0", "", getLeaves(fullTree))), null, 2);
      }
      return getLeaves(fullTree)
        .map((leaf) => leaf.content)
        .join("\n\n");
    }

    case "column": {
      if (format === "json") {
        return JSON.stringify(treeToJSON(false, makeTree("0", "", columnCards)), null, 2);
      }
      return columnCards.map((card) => card.content).join("\n\n");
    }
  }
}
