// `.gkw` document codec.
//
// Byte-for-byte port of the parts of `Coders.elm` that read and write
// documents. The file format is a sequence of nested `<gingko-card>` tags with
// Markdown content:
//
//   <gingko-card id="1">
//
//   Hello
//
//   <gingko-card id="2">
//
//   Child
//
//   </gingko-card>
//   </gingko-card>
//
// `normalizeInput` rewrites the tags into private markers so the parser can
// scan for them without confusing Markdown text for structure, and
// `treeToMarkdownOutline` writes the canonical form.

import type { Tree } from "./tree.ts";

export type ParseResult =
  | { ok: true; trees: Tree[] }
  | { ok: false; error: string };

const OPEN_PREFIX = "%!#<gingko-card|";
const CARD_MARKER = "%!#<gingko-card";
const CLOSE_TAG = "%!#<gingko-card/>";

class ParseFailure extends Error {}

/** Rewrites `<gingko-card …>` tags into the private parser markers. */
export function normalizeInput(input: string): string {
  return input
    .replace(/<\s*gingko-card\s{1,}id="([^"]*)"\s*>/g, (_match, id: string) => {
      return `${OPEN_PREFIX}${id}>`;
    })
    .replace(/<\/\s*gingko-card\s*>\s*/g, CLOSE_TAG);
}

/**
 * Normalizes and parses document text.
 *
 * The grammar matches `Coders.treesParser`:
 *
 *   document := tree* EOF
 *   tree     := "%!#<gingko-card|" id ">" content tree* ("%!#<gingko-card/>" | EOF)
 *
 * Content is everything up to the next marker and is unwrapped from the two
 * newlines the serializer adds around it.
 */
export function normalizeAndParse(input: string): ParseResult {
  const normalized = normalizeInput(input);
  try {
    const { trees, position } = parseTrees(normalized, 0);
    if (position !== normalized.length) {
      throw new ParseFailure("unexpected text after the last card");
    }
    return { ok: true, trees };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseTrees(source: string, start: number): { trees: Tree[]; position: number } {
  const trees: Tree[] = [];
  let position = start;

  for (;;) {
    const parsed = parseTree(source, position);
    if (!parsed) break;
    trees.push(parsed.tree);
    position = parsed.position;
  }

  return { trees, position };
}

function parseTree(source: string, start: number): { tree: Tree; position: number } | null {
  // A missing opening marker is "no more trees", not a syntax error.
  if (!source.startsWith(OPEN_PREFIX, start)) return null;

  let position = start + OPEN_PREFIX.length;

  const idEnd = source.indexOf(">", position);
  if (idEnd === -1) throw new ParseFailure("unterminated card id");
  const id = source.slice(position, idEnd);
  position = idEnd + 1;

  const contentEnd = source.indexOf(CARD_MARKER, position);
  if (contentEnd === -1) throw new ParseFailure("unterminated card content");
  const content = unwrapContent(source.slice(position, contentEnd));

  const nested = parseTrees(source, contentEnd);
  position = nested.position;

  if (source.startsWith(CLOSE_TAG, position)) {
    position += CLOSE_TAG.length;
  } else if (position !== source.length) {
    throw new ParseFailure("expected a closing gingko-card tag");
  }

  return { tree: { id, content, children: nested.trees }, position };
}

function unwrapContent(value: string): string {
  if (value.length >= 4 && value.startsWith("\n\n") && value.endsWith("\n\n")) {
    return value.slice(2, value.length - 2);
  }
  return value;
}

/* ================= Serialization ================= */

/** Writes the canonical `.gkw` format (`Coders.treeToMarkdownOutline`). */
export function treeToMarkdownOutline(withRoot: boolean, tree: Tree): string {
  if (withRoot) return markdownOutlineNode(tree);
  return tree.children.map(markdownOutlineNode).join("\n");
}

function markdownOutlineNode(tree: Tree): string {
  const children = tree.children.map(markdownOutlineNode).concat("");
  return `<gingko-card id="${tree.id}">\n\n${tree.content}\n\n${children.join("\n")}</gingko-card>`;
}

/** Plain Markdown outline used for word counts and Markdown export. */
export function treeToMarkdownString(withRoot: boolean, tree: Tree): string {
  const contentList = tree.children.map(markdownRecurse);
  if (withRoot) {
    return [tree.content, ...contentList].join("\n\n");
  }
  return contentList.join("\n\n");
}

function markdownRecurse(tree: Tree): string {
  return [tree.content, ...tree.children.map(markdownRecurse)].join("\n\n");
}

/* ================= OPML and JSON export ================= */

function attrEncode(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
    .replaceAll("<", "&lt;");
}

export function treeToOPML(docName: string, tree: Tree): string {
  const title = attrEncode(docName).replaceAll(">", "&gt;");
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n<opml version="2.0">\n<head><title>' +
    title +
    "</title></head>\n<body>" +
    treeToOPMLBody(tree) +
    "</body></opml>"
  );
}

function treeToOPMLBody(tree: Tree): string {
  return `<outline text="${attrEncode(tree.content)}">${tree.children
    .map(treeToOPMLBody)
    .join("\n")}</outline>\n`;
}

export interface JsonTree {
  content: string;
  children: JsonTree[];
}

export function treeToJSON(withRoot: boolean, tree: Tree): JsonTree[] {
  if (withRoot) return [treeToJSONRecurse(tree)];
  return tree.children.map(treeToJSONRecurse);
}

export function treeToJSONRecurse(tree: Tree): JsonTree {
  return { content: tree.content, children: tree.children.map(treeToJSONRecurse) };
}

export interface TreeValue {
  id: string;
  content: string;
  children: TreeValue[];
}

/** Shape used by the Elm ↔ JS interop ports (`Coders.treeToValue`). */
export function treeToValue(tree: Tree): TreeValue {
  return {
    id: tree.id,
    content: tree.content,
    children: tree.children.map(treeToValue)
  };
}
