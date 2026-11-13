// Keyboard shortcuts.
//
// Port of the legacy renderer's `Mousetrap` bindings plus the `Keyboard`
// message handling in `Page.Doc`. `Mousetrap` is kept so the same key names
// and the textarea exceptions behave identically.
//
// Two differences from the Elm version are deliberate:
//   * `Ctrl/Cmd+S` saves the open card (the menu owns the global save)
//   * `Enter` inside a textarea stays a newline; the shortcut only fires when
//     the textarea does not have focus

import Mousetrap from "mousetrap";

import { setHeadingLevel, surroundSelection } from "./model/text.ts";
import { useDocument } from "./state/documentStore.ts";

/** Shortcuts the document view reacts to (`helpers.shortcuts` minus file ops). */
const SHORTCUTS = [
  "shift+enter",
  "mod+enter",
  "mod+s",
  "enter",
  "esc",
  "mod+backspace",
  "mod+j",
  "mod+down",
  "mod+k",
  "mod+up",
  "mod+l",
  "mod+right",
  "mod+shift+j",
  "mod+shift+down",
  "mod+shift+k",
  "mod+shift+up",
  "h",
  "j",
  "k",
  "l",
  "left",
  "down",
  "up",
  "right",
  "alt+left",
  "alt+h",
  "alt+down",
  "alt+j",
  "alt+up",
  "alt+k",
  "alt+right",
  "alt+l",
  "alt+shift+up",
  "alt+shift+down",
  "alt+home",
  "alt+end",
  "alt+pageup",
  "alt+pagedown",
  "alt+0",
  "alt+1",
  "alt+2",
  "alt+3",
  "alt+4",
  "alt+5",
  "alt+6",
  "[",
  "]",
  "mod+x",
  "mod+c",
  "mod+v",
  "mod+shift+v",
  "mod+z",
  "mod+shift+z",
  "mod+b",
  "mod+i",
  "end",
  "home",
  "pageup",
  "pagedown",
  "/"
] as const;

/**
 * Keys whose browser default must be suppressed (`helpers.needOverride`).
 * `mod+s` / `mod+o` are menu accelerators, so they are not listed here.
 */
const NEED_OVERRIDE = new Set([
  "mod+n",
  "mod+h",
  "mod+j",
  "mod+k",
  "mod+l",
  "mod+b",
  "mod+i",
  "alt+0",
  "alt+1",
  "alt+2",
  "alt+3",
  "alt+4",
  "alt+5",
  "alt+6"
]);

function isTextareaFocused(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLTextAreaElement && active.classList.contains("mousetrap");
}

function isMacPlatform(): boolean {
  return window.electronAPI.platform === "darwin";
}

/** Reads the clipboard and dispatches a paste of its tree or text payload. */
async function pasteFromClipboard(into: boolean): Promise<void> {
  const text = await window.electronAPI.readClipboard();
  const store = useDocument.getState();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Plain text paste: the store wraps it in a single card.
  }
  if (into) store.pasteInto(payload);
  else store.paste(payload);
}

/** Applies `Alt+0..6` to the focused textarea's first line. */
function applyHeading(level: number): void {
  const textarea = document.activeElement;
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  const next = setHeadingLevel(textarea.value, level);
  if (next === textarea.value) return;

  // Updating the value through React requires an input event; dispatching one
  // keeps the store in sync without reaching into its internals.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  setter?.call(textarea, next);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Wraps the textarea selection in `token` (bold/italic). */
function surround(token: string): void {
  const textarea = document.activeElement;
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  const result = surroundSelection(
    textarea.value,
    textarea.selectionStart,
    textarea.selectionEnd,
    token
  );
  if (!result) return;

  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value"
  )?.set;
  setter?.call(textarea, result.value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
}

/**
 * Installs the global bindings. Returns a function that removes them again.
 */
export function installKeyboard(): () => void {
  const store = () => useDocument.getState();

  Mousetrap.bind(SHORTCUTS as unknown as string[], (event, combo) => {
    const editing = store().viewMode !== "normal";

    // Inside a textarea, only the editing shortcuts are meaningful; everything
    // else is left to the textarea (typing, selection, undo).
    if (isTextareaFocused() && !combo.startsWith("mod+") && !combo.startsWith("alt+")) {
      return;
    }

    switch (combo) {
      case "enter":
        if (isTextareaFocused()) return;
        store().openCard(store().active);
        break;

      case "shift+enter":
        if (!editing) {
          store().openCardFullscreen(store().active);
          // The fullscreen editor mounts (and focuses) a textarea during this
          // keydown; without this the browser would insert a newline into it.
          return false;
        }
        break;

      case "mod+enter":
        store().saveAndCloseCard();
        break;

      case "mod+s":
        store().saveIfEditing();
        break;

      case "esc":
        if (editing) store().closeCard();
        break;

      case "mod+backspace":
        if (!editing) store().deleteCard(store().active);
        break;

      case "mod+j":
      case "mod+down":
        if (!editing) store().insertBelow(store().active);
        break;

      case "mod+k":
      case "mod+up":
        if (!editing) store().insertAbove(store().active);
        break;

      case "mod+l":
      case "mod+right":
        store().insertChild(store().active);
        break;

      case "mod+shift+j":
      case "mod+shift+down":
        if (!editing) store().mergeDown();
        break;

      case "mod+shift+k":
      case "mod+shift+up":
        if (!editing) store().mergeUp();
        break;

      case "h":
      case "left":
        if (!editing) store().goLeft();
        break;

      case "j":
      case "down":
        if (!editing) store().goDown();
        break;

      case "k":
      case "up":
        if (!editing) store().goUp();
        break;

      case "l":
      case "right":
        if (!editing) store().goRight();
        break;

      case "alt+up":
      case "alt+k":
        if (!editing) store().moveWithin(-1);
        break;

      case "alt+down":
      case "alt+j":
        if (!editing) store().moveWithin(1);
        break;

      case "alt+left":
      case "alt+h":
        if (!editing) store().moveLeft();
        break;

      case "alt+right":
      case "alt+l":
        if (!editing) store().moveRight();
        break;

      case "alt+shift+up":
        if (!editing) store().moveWithin(-5);
        break;

      case "alt+shift+down":
        if (!editing) store().moveWithin(5);
        break;

      case "alt+home":
      case "alt+pageup":
        if (!editing) store().moveWithin(-999999);
        break;

      case "alt+end":
      case "alt+pagedown":
        if (!editing) store().moveWithin(999999);
        break;

      case "home":
        if (!editing) store().goToTopOfColumn();
        break;

      case "end":
        if (!editing) store().goToBottomOfColumn();
        break;

      case "pageup":
        if (!editing) store().goToTopOfGroup();
        break;

      case "pagedown":
        if (!editing) store().goToBottomOfGroup();
        break;

      case "mod+x":
        if (!editing) store().cut();
        break;

      case "mod+c": {
        // The export preview owns Cmd+C so the user can copy previewed text.
        if (document.getElementById("export-preview") !== null) break;
        if (!editing) store().copy();
        break;
      }

      case "mod+v":
        void pasteFromClipboard(false);
        break;

      case "mod+shift+v":
        void pasteFromClipboard(true);
        break;

      case "mod+z":
        // The version-history slider arrives with Phase 6; until then this is
        // a no-op in normal mode, matching the desktop menu's undo entry.
        break;

      case "mod+b":
        if (editing) surround("**");
        break;

      case "mod+i":
        if (editing) surround("*");
        break;

      case "/":
        if (!editing) {
          window.dispatchEvent(new Event("focus-search"));
          return false;
        }
        break;

      case "alt+0":
      case "alt+1":
      case "alt+2":
      case "alt+3":
      case "alt+4":
      case "alt+5":
      case "alt+6":
        if (isTextareaFocused()) applyHeading(Number(combo.slice(-1)));
        break;

      case "[":
      case "]":
      case "mod+shift+z":
        break;

      default:
        break;
    }

    if (NEED_OVERRIDE.has(combo)) return false;
    if (!isMacPlatform() && combo === "alt+left") return false;
    void event;
    return undefined;
  });

  return () => {
    Mousetrap.unbind(SHORTCUTS as unknown as string[]);
  };
}
