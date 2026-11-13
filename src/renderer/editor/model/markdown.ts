// Card content rendering.
//
// The Elm view ran card text through `Markdown.toHtmlWith` with GFM tables and
// hard breaks, after rewriting three custom syntaxes:
//
//   `{++added++}`  -> <ins class="diff">
//   `{--deleted--}` -> <del class="diff">
//   `[ ]` / `[x]`  -> an interactive checkbox
//
// `marked` produces the same HTML shape for headings, lists, code and tables.
// The checkbox rewrite stays a string pass so the rendered checkboxes keep the
// `checkboxClicked(cardId, n)` handler the original DOM used.

import { marked } from "marked";

const OPEN_ADD = /\{\+\+/g;
const CLOSE_ADD = /\+\+\}/g;
const OPEN_DEL = /\{--/g;
const CLOSE_DEL = /--\}/g;
const CHECKBOX = /\[(x| )\]/gi;

/** Escapes text for a single-quoted HTML attribute. */
function attr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * Applies the diff markers and turns Markdown checkboxes into clickable inputs.
 *
 * The checkbox counter is 1-based and counts every `[ ]`/`[x]` in the card, in
 * order — matching `Doc.UI`'s `Regex.replace` numbering.
 */
export function preprocessContent(content: string, cardId: string): string {
  let checkboxNumber = 0;

  return content
    .replace(OPEN_ADD, "<ins class='diff'>")
    .replace(CLOSE_ADD, "</ins>")
    .replace(OPEN_DEL, "<del class='diff'>")
    .replace(CLOSE_DEL, "</del>")
    .replace(CHECKBOX, (match) => {
      checkboxNumber += 1;
      const checked = match.toLowerCase() === "[x]" ? " checked" : "";
      return `<input type='checkbox'${checked} data-card-id='${attr(cardId)}' data-checkbox='${checkboxNumber}'/>`;
    });
}

const MARKDOWN_OPTIONS = {
  gfm: true,
  breaks: true,
  async: false
} as const;

/** Renders one card's Markdown to HTML. */
export function renderContent(content: string, cardId: string): string {
  return marked.parse(preprocessContent(content, cardId), MARKDOWN_OPTIONS) as string;
}

/** First line of a card, trimmed, for breadcrumbs (`(empty)` when blank). */
export function cardTitle(content: string): string {
  const firstLine = content.split(/\r\n|\r|\n/)[0] ?? "";
  const trimmed = firstLine.trim();
  return trimmed === "" ? "(empty)" : trimmed;
}
