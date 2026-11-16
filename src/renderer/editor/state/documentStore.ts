// Document editor state.
//
// Port of `Page.Doc.Model` and the desktop-relevant parts of `Page.Doc.update`.
// The tree is immutable and transformed by `treeOps`; Zustand holds the tree
// plus transient editing state, and components subscribe to narrow slices so a
// large document does not re-render wholesale.
//
// Two timers mirror the Elm debouncers:
//   - local save (0.5 s quiet) writes through `save-file` into the swap file
//   - commit (3 s throttle) sends a `commit-data` request
// The main process still owns file IO and the version store.

import { create } from "zustand";

import type { Tree } from "../model/tree.ts";
import { makeTree } from "../model/tree.ts";
import {
  getIndex,
  getParent,
  getSiblings,
  insertSubtree,
  mergeTrees,
  moveSubtree,
  preorderTraversal,
  pruneSubtree
} from "../model/treeOps.ts";
import {
  getContent,
  getFirstCard,
  getFirstInColumn,
  getLastInColumn,
  getNextInColumn,
  getPrev,
  getPrevInColumn
} from "../model/treeView.ts";
import { toggleCheckbox } from "../model/text.ts";
import { treeToMarkdownOutline, treeToValue } from "../model/coders.ts";
import {
  decodeHistory,
  emptyHistory,
  headSha,
  lastCommitTime,
  mergeHistory,
  requestCommit,
  treeFromCommit,
  type HistoryData
} from "../model/history.ts";

export type ViewMode = "normal" | "editing" | "fullscreen";

export interface FileReceivedPayload {
  filePath: string;
  fileData: string | null;
  fileSettings: { "last-actives"?: string[] } | null;
  undoData: unknown;
  isUntitled: boolean;
}

export interface DocumentState {
  tree: Tree;
  filePath: string;
  isUntitled: boolean;
  language: string;
  isMac: boolean;

  active: string;
  activePast: string[];
  viewMode: ViewMode;
  field: string;

  dirty: boolean;
  lastSave: number | null;
  lastCommit: number | null;
  history: HistoryData;
  searchField: string | null;
  currentTime: number;
  /** False until the document payload has been applied. */
  ready: boolean;

  /** Id of the card being dragged, or null. */
  dragging: string | null;
  /** `kind:cardId` of the hovered drop region. */
  dropTarget: string | null;

  /** Whether the version-history menu is open. */
  historyOpen: boolean;
  /** Raised history slider bound: the commit the history starts from. */
  historyStart: string;
  /** The commit the slider currently points at (previewed). */
  historyCurrent: string;

  init(payload: FileReceivedPayload, tree: Tree, language: string, isMac: boolean): void;
  tick(now: number): void;

  activate(id: string): void;
  openCard(id: string): void;
  openCardFullscreen(id: string): void;
  closeCard(): void;
  saveAndCloseCard(): void;
  updateField(text: string): void;
  saveIfEditing(): void;

  insertAbove(id: string): void;
  insertBelow(id: string): void;
  insertChild(id: string): void;
  deleteCard(id: string): void;
  toggleCheckboxAt(cardId: string, checkboxNumber: number): void;

  goLeft(): void;
  goRight(): void;
  goUp(): void;
  goDown(): void;
  goToTopOfColumn(): void;
  goToBottomOfColumn(): void;
  goToTopOfGroup(): void;
  goToBottomOfGroup(): void;

  moveWithin(delta: number): void;
  moveLeft(): void;
  moveRight(): void;
  mergeUp(): void;
  mergeDown(): void;

  cut(): void;
  copy(): void;
  paste(payload: unknown): void;
  pasteInto(payload: unknown): void;

  startDrag(id: string): void;
  endDrag(): void;
  dropTree(kind: "above" | "into" | "below", targetId: string): void;

  setSearchField(text: string): void;
  enterFullscreen(): void;
  exitFullscreen(): void;

  markFileSaved(path: string, savedAt: number, isUntitled: boolean): void;
  mergeCommitResult(payload: unknown): void;

  openHistory(): void;
  closeHistory(): void;
  previewHistory(commitSha: string): void;
  restoreHistory(): void;
}

/* ================= Helpers ================= */

/** A brand-new document: a root and one empty card (`TreeStructure.defaultTree`). */
export function defaultDocumentTree(): Tree {
  return makeTree("0", "", [makeTree("1", "")]);
}

let idCounter = 0;

/** Fresh id, unique within `tree`. */
function newNodeId(tree: Tree): string {
  const used = new Set(preorderTraversal(tree));
  for (;;) {
    idCounter += 1;
    const candidate = `node-${Math.floor(Math.random() * 2147483647)}${idCounter}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Re-ids a pasted subtree so it cannot collide with existing cards.
 *
 * The Elm implementation derived ids from SHA-1 of a seed; ids only need to be
 * unique inside the document, so a random suffix is equivalent.
 */
function renameSubtree(tree: Tree, used: Set<string>): Tree {
  let id: string;
  do {
    idCounter += 1;
    id = `node-${Math.floor(Math.random() * 2147483647)}${idCounter}`;
  } while (used.has(id));
  used.add(id);

  return {
    id,
    content: tree.content,
    children: tree.children.map((child) => renameSubtree(child, used))
  };
}

/** Decodes a clipboard payload into a tree (`Coders.treeOrString`). */
export function decodePastedTree(payload: unknown): Tree | null {
  if (typeof payload === "string") return makeTree("0", payload);
  if (!payload || typeof payload !== "object") return null;

  const node = payload as { id?: unknown; content?: unknown; children?: unknown };
  if (typeof node.content !== "string") return null;

  const children = Array.isArray(node.children)
    ? node.children
        .map((child) => decodePastedTree(child))
        .filter((child): child is Tree => child !== null)
    : [];

  return makeTree(typeof node.id === "string" ? node.id : "0", node.content, children);
}

function findById(tree: Tree, id: string): Tree | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findById(child, id);
    if (found) return found;
  }
  return undefined;
}

/** Returns a copy of the tree with `id`'s content replaced. */
function withContent(tree: Tree, id: string, content: string): Tree {
  if (tree.id === id) return { ...tree, content };
  return { ...tree, children: tree.children.map((child) => withContent(child, id, content)) };
}

/** Serialized document, using the in-flight text while a card is open. */
function markdownForSave(state: DocumentState): string {
  const tree =
    state.viewMode === "normal" ? state.tree : withContent(state.tree, state.active, state.field);
  return treeToMarkdownOutline(false, tree);
}

/* ================= Timers ================= */

const LOCAL_SAVE_QUIET_MS = 500;
const COMMIT_THROTTLE_MS = 3000;

let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
let commitTimer: ReturnType<typeof setTimeout> | null = null;
let lastCommitSentAt = 0;

function cancelLocalSave(): void {
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = null;
}

function cancelCommit(): void {
  if (commitTimer) clearTimeout(commitTimer);
  commitTimer = null;
}

/** Test seam: drops pending timers and resets throttle bookkeeping. */
export function resetSaveTimersForTests(): void {
  cancelLocalSave();
  cancelCommit();
  lastCommitSentAt = 0;
}

/* ================= Store ================= */

export const useDocument = create<DocumentState>((set, get) => {
  const scheduleLocalSave = () => {
    cancelLocalSave();
    localSaveTimer = setTimeout(() => {
      localSaveTimer = null;
      const state = get();
      window.electronAPI.saveFile([state.filePath, markdownForSave(state)]);
    }, LOCAL_SAVE_QUIET_MS);
  };

  const scheduleCommit = () => {
    const wait = Math.max(0, COMMIT_THROTTLE_MS - (Date.now() - lastCommitSentAt));
    cancelCommit();
    commitTimer = setTimeout(() => {
      commitTimer = null;
      lastCommitSentAt = Date.now();
      const state = get();
      window.electronAPI.commitData(
        requestCommit(treeToValue(state.tree), state.history, JSON.stringify(state.filePath))
      );
    }, wait);
  };

  /** Applies a structural edit, then schedules the save and commit timers. */
  const commitTreeChange = (tree: Tree, extra: Partial<DocumentState> = {}) => {
    set({ tree, dirty: true, ...extra });
    scheduleLocalSave();
    scheduleCommit();
  };

  /** Folds the open card's text into the tree. Returns whether it changed. */
  const saveIfEditing = (): boolean => {
    const state = get();
    if (state.viewMode === "normal") return false;

    const updated = withContent(state.tree, state.active, state.field);
    const current = findById(state.tree, state.active);
    if (current && current.content === state.field) {
      if (state.dirty) set({ dirty: false });
      return false;
    }

    set({ tree: updated, dirty: true });
    scheduleLocalSave();
    scheduleCommit();
    return true;
  };

  const activate = (id: string) => {
    const state = get();
    if (id === "0") return;

    const target = findById(state.tree, id) ?? getFirstCard(state.tree);
    if (!target) return;

    set({
      active: target.id,
      activePast:
        id === state.active ? state.activePast : [state.active, ...state.activePast].slice(0, 40),
      field: target.content
    });
  };

  /** Inserts an empty card and opens it for editing. */
  const insert = (parentId: string, index: number) => {
    const state = get();
    const id = newNodeId(state.tree);
    commitTreeChange(insertSubtree(makeTree(id, ""), parentId, index, state.tree), {
      active: id,
      field: "",
      viewMode: "editing"
    });
    return id;
  };

  const insertRelative = (id: string, delta: number) => {
    const state = get();
    const index = getIndex(id, state.tree);
    const parent = getParent(id, state.tree);
    if (index === undefined || !parent) return;
    insert(parent.id, index + delta);
  };

  const move = (subtree: Tree, parentId: string, index: number) => {
    const state = get();
    commitTreeChange(moveSubtree(subtree, parentId, index, state.tree), { active: subtree.id });
  };

  return {
    tree: defaultDocumentTree(),
    filePath: "",
    isUntitled: true,
    language: "en",
    isMac: false,

    active: "1",
    activePast: [],
    viewMode: "normal",
    field: "",

    dirty: false,
    lastSave: null,
    lastCommit: null,
    history: emptyHistory(),
    searchField: null,
    currentTime: Date.now(),
    ready: false,
    dragging: null,
    dropTarget: null,
    historyOpen: false,
    historyStart: "",
    historyCurrent: "",

    init(payload, tree, language, isMac) {
      const history = decodeHistory(payload.undoData);
      const lastActives = payload.fileSettings?.["last-actives"] ?? [];
      const firstActive = lastActives.find((id) => findById(tree, id)) ?? getFirstCard(tree)?.id ?? "1";

      set({
        tree,
        filePath: payload.filePath,
        isUntitled: payload.isUntitled,
        language,
        isMac,
        history,
        lastCommit: lastCommitTime(history) ?? null,
        ready: true,
        active: firstActive,
        activePast: lastActives.filter((id) => id !== firstActive),
        viewMode: payload.isUntitled ? "editing" : "normal",
        field: findById(tree, firstActive)?.content ?? "",
        // An untitled document has not been written to its real file yet, but
        // the swap file already holds this content, so it is not "dirty".
        dirty: false,
        historyStart: headSha(history) ?? "",
        historyCurrent: "",
        currentTime: Date.now()
      });
    },

    tick(now) {
      set({ currentTime: now });
    },

    activate,

    openCard(id) {
      const state = get();
      set({ viewMode: "editing", active: id, field: getContent(id, state.tree) });
    },

    openCardFullscreen(id) {
      const state = get();
      set({ viewMode: "fullscreen", active: id, field: getContent(id, state.tree) });
    },

    closeCard() {
      set({ viewMode: "normal", field: "" });
    },

    saveAndCloseCard() {
      const state = get();
      if (state.viewMode === "normal") {
        get().openCard(state.active);
        return;
      }
      saveIfEditing();
      set({ viewMode: "normal", field: "" });
    },

    updateField(text) {
      set({ field: text, dirty: true });
      scheduleLocalSave();
    },

    saveIfEditing,

    insertAbove(id) {
      insertRelative(id, 0);
    },

    insertBelow(id) {
      insertRelative(id, 1);
    },

    insertChild(id) {
      insert(id, Number.MAX_SAFE_INTEGER);
    },

    deleteCard(id) {
      const state = get();
      const parent = getParent(id, state.tree);
      const prev = getPrevInColumn(id, state.tree);
      const next = getNextInColumn(id, state.tree);

      // The root (and a lone card) cannot be removed.
      if (!parent && !prev && !next) return;

      const nextActive = prev?.id ?? next?.id ?? parent?.id ?? "1";
      commitTreeChange(pruneSubtree(id, state.tree), {
        active: nextActive === id ? "1" : nextActive,
        viewMode: "normal",
        field: ""
      });
    },

    toggleCheckboxAt(cardId, checkboxNumber) {
      const state = get();
      const card = findById(state.tree, cardId);
      if (!card) return;
      const content = toggleCheckbox(card.content, checkboxNumber);
      commitTreeChange(withContent(state.tree, cardId, content), {
        field: state.active === cardId ? content : state.field
      });
    },

    goLeft() {
      const state = get();
      const parent = getParent(state.active, state.tree);
      if (parent) activate(parent.id);
    },

    goRight() {
      const state = get();
      const card = findById(state.tree, state.active);
      if (!card || card.children.length === 0) return;
      const childIds = card.children.map((child) => child.id);
      const previous = state.activePast.find((id) => childIds.includes(id));
      activate(previous ?? childIds[0]);
    },

    goUp() {
      const state = get();
      const prev = getPrevInColumn(state.active, state.tree);
      if (prev) activate(prev.id);
    },

    goDown() {
      const state = get();
      const next = getNextInColumn(state.active, state.tree);
      if (next) activate(next.id);
    },

    goToTopOfColumn() {
      activate(getFirstInColumn(get().active, get().tree));
    },

    goToBottomOfColumn() {
      activate(getLastInColumn(get().active, get().tree));
    },

    goToTopOfGroup() {
      const state = get();
      const first = getSiblings(state.active, state.tree)[0]?.id ?? state.active;
      if (first === state.active) {
        activate(getPrevInColumn(state.active, state.tree)?.id ?? first);
      } else {
        activate(first);
      }
    },

    goToBottomOfGroup() {
      const state = get();
      const siblings = getSiblings(state.active, state.tree);
      const last = siblings[siblings.length - 1]?.id ?? state.active;
      if (last === state.active) {
        activate(getNextInColumn(state.active, state.tree)?.id ?? last);
      } else {
        activate(last);
      }
    },

    moveWithin(delta) {
      const state = get();
      const card = findById(state.tree, state.active);
      const parent = getParent(state.active, state.tree);
      const index = getIndex(state.active, state.tree);
      if (!card || !parent || index === undefined) return;
      move(card, parent.id, Math.max(0, index + delta));
    },

    moveLeft() {
      const state = get();
      const card = findById(state.tree, state.active);
      const parent = getParent(state.active, state.tree);
      if (!card || !parent) return;
      const grandparent = getParent(parent.id, state.tree);
      const parentIndex = getIndex(parent.id, state.tree);
      if (!grandparent || parentIndex === undefined) return;
      move(card, grandparent.id, parentIndex + 1);
    },

    moveRight() {
      const state = get();
      const card = findById(state.tree, state.active);
      if (!card) return;
      const prev = getPrev(state.active, state.tree);
      if (!prev) return;
      move(card, prev.id, Number.MAX_SAFE_INTEGER);
    },

    mergeUp() {
      const state = get();
      const current = findById(state.tree, state.active);
      const prev = getPrevInColumn(state.active, state.tree);
      if (!current || !prev) return;
      commitTreeChange(mergeTrees(current, prev, true, state.tree), { active: prev.id });
    },

    mergeDown() {
      const state = get();
      const current = findById(state.tree, state.active);
      const next = getNextInColumn(state.active, state.tree);
      if (!current || !next) return;
      commitTreeChange(mergeTrees(current, next, false, state.tree), { active: next.id });
    },

    cut() {
      const state = get();
      const card = findById(state.tree, state.active);
      const parent = getParent(state.active, state.tree);
      const prev = getPrevInColumn(state.active, state.tree);
      const next = getNextInColumn(state.active, state.tree);
      if (!card || (parent && !prev && !next)) return;

      window.electronAPI.copyText(JSON.stringify(treeToValue(card)));
      get().deleteCard(state.active);
    },

    copy() {
      const state = get();
      const card = findById(state.tree, state.active);
      if (!card) return;
      window.electronAPI.copyText(JSON.stringify(treeToValue(card)));
    },

    paste(payload) {
      const state = get();
      const pasted = decodePastedTree(payload);
      if (!pasted) return;

      const used = new Set(preorderTraversal(state.tree));
      const renamed = renameSubtree(pasted, used);
      const parent = getParent(state.active, state.tree);
      const index = getIndex(state.active, state.tree);
      commitTreeChange(
        insertSubtree(renamed, parent?.id ?? "0", (index ?? 0) + 1, state.tree),
        { active: renamed.id }
      );
    },

    pasteInto(payload) {
      const state = get();
      const pasted = decodePastedTree(payload);
      if (!pasted) return;

      const used = new Set(preorderTraversal(state.tree));
      const renamed = renameSubtree(pasted, used);
      commitTreeChange(insertSubtree(renamed, state.active, Number.MAX_SAFE_INTEGER, state.tree), {
        active: renamed.id
      });
    },

    startDrag(id) {
      const state = get();
      const card = findById(state.tree, id);
      if (!card) return;
      set({ dragging: id, dropTarget: null });
    },

    endDrag() {
      set({ dragging: null, dropTarget: null });
    },

    dropTree(kind, targetId) {
      const state = get();
      const draggedId = state.dragging;
      if (!draggedId || draggedId === targetId) {
        set({ dragging: null, dropTarget: null });
        return;
      }

      // The dragged card stays in the tree until the drop, so a cancelled drag
      // needs no rollback.
      const dragged = findById(state.tree, draggedId);
      if (!dragged) {
        set({ dragging: null, dropTarget: null });
        return;
      }

      const target = findById(state.tree, targetId);
      if (!target) {
        set({ dragging: null, dropTarget: null });
        return;
      }

      let parentId: string;
      let index: number;
      if (kind === "into") {
        parentId = targetId;
        index = Number.MAX_SAFE_INTEGER;
      } else {
        parentId = getParent(targetId, state.tree)?.id ?? "0";
        const targetIndex = getIndex(targetId, state.tree) ?? 0;
        index = kind === "above" ? targetIndex : targetIndex + 1;
      }

      // Dropping into its own subtree would detach the tree; ignore it.
      if (preorderTraversal(dragged).includes(parentId)) {
        set({ dragging: null, dropTarget: null });
        return;
      }

      commitTreeChange(moveSubtree(dragged, parentId, index, state.tree), {
        active: draggedId,
        dragging: null,
        dropTarget: null
      });
    },

    setSearchField(text) {
      const state = get();
      const searchField = text === "" ? null : text;
      set({ searchField });
      if (!searchField) return;

      const term = searchField.toLowerCase();
      const first = preorderTraversal(state.tree).find((id) => {
        const card = findById(state.tree, id);
        return card ? card.content.toLowerCase().includes(term) : false;
      });
      if (first) activate(first);
    },

    enterFullscreen() {
      set({ viewMode: "fullscreen" });
    },

    exitFullscreen() {
      saveIfEditing();
      set({ viewMode: "editing" });
    },

    markFileSaved(path, savedAt, isUntitled) {
      set({ filePath: path, isUntitled, dirty: false, lastSave: savedAt, currentTime: savedAt });
    },

    mergeCommitResult(payload) {
      const history = mergeHistory(get().history, decodeHistory(payload));
      set({ history, dirty: false, lastCommit: lastCommitTime(history) ?? null });
    },

    openHistory() {
      const state = get();
      const start = state.historyStart || headSha(state.history) || "";
      const current = start;
      // Peak at the newest commit so the slider starts on the current version.
      set({ historyOpen: true, historyStart: start, historyCurrent: current });
    },

    closeHistory() {
      set({ historyOpen: false });
    },

    previewHistory(commitSha) {
      set({ historyCurrent: commitSha });
    },

    restoreHistory() {
      const state = get();
      if (!state.historyCurrent) return;
      const tree = treeFromCommit(state.historyCurrent, state.history);
      if (!tree) return;

      // Replace the working tree with the restored version and treat it as a
      // structural edit: the existing save/commit timers persist it and open a
      // new branch on the restored commit.
      commitTreeChange(tree, { viewMode: "normal", field: "" });
      set({ historyOpen: false, tree });
    }
  };
});
