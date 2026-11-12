// Text statistics used by the word-count menu and save indicator.
//
// Port of `Doc.UI.countWords` / `Doc.UI.count`. The punctuation set matches
// the Elm regular expression exactly; hyphens and underscores stay inside
// words.

const PUNCTUATION = /[!@#$%^&*():;"',.]+/g;

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(PUNCTUATION, "")
    .split(/\s+/)
    .filter((word) => word !== "");
}

export function countWords(value: string): number {
  return words(value).length;
}

/** [word count, character count]; characters are Unicode code points. */
export function count(value: string): [number, number] {
  return [words(value).length, Array.from(value).length];
}

export interface SurroundResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

/**
 * Wraps the selected range in `token` (used for bold/italic).
 *
 * Mirrors the `TextSurround` DOM helper: the cursor moves to the end of the
 * wrapped selection, and an empty selection is left untouched.
 */
export function surroundSelection(
  value: string,
  start: number,
  end: number,
  token: string
): SurroundResult | null {
  if (start === end) return null;

  const selected = value.slice(start, end);
  const modified = `${token}${selected}${token}`;
  const nextValue = value.slice(0, start) + modified + value.slice(end);
  const cursor = start + modified.length;

  return { value: nextValue, selectionStart: cursor, selectionEnd: cursor };
}

/** Applies the Alt+0..6 heading shortcut to the first line. */
export function setHeadingLevel(value: string, level: number): string {
  const replacement = level === 0 ? "$2" : `${"#".repeat(level)} $2`;
  return value.replace(/^(#{0,6}) ?(.*)/, replacement);
}

/**
 * Toggles the n-th Markdown checkbox (1-based), matching `CheckboxClicked`.
 * `[ ]` becomes `[X]`; `[x]` and `[X]` become `[ ]`.
 */
export function toggleCheckbox(value: string, checkboxNumber: number): string {
  let index = 0;
  return value.replace(/\[(x| )\]/gi, (match) => {
    index += 1;
    if (index !== checkboxNumber) return match;
    if (match === "[ ]") return "[X]";
    return "[ ]";
  });
}
