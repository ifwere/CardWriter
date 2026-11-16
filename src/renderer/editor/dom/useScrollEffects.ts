// Fires the viewport scroll and persistence side effects that the Elm app
// triggered through the `ScrollCards` / `ScrollFullscreenCards` messages and
// the renderer's DOM helpers.
//
//   * on init (`ready`) — instantly scroll to the restored active card
//   * on every activation — scroll each column to its target, then persist
//     `last-actives` through the debounced `local-store-set` channel
//   * entering fullscreen — center the active card in `#fullscreen-main`
//   * leaving fullscreen — re-centre the columns instantly, like `closeCard`
//   * exiting edit mode — re-activate so the active card is scrolled into view
//
// All of this reads the freshly-rendered DOM, so it runs after a paint.

import { useEffect, useRef } from "react";

import { getTree } from "../model/treeOps.ts";
import { getDepth, getScrollPositions } from "../model/treeView.ts";
import { applyScroll, scrollFullscreenTo } from "../dom/viewport.ts";
import { useDocument } from "../state/documentStore.ts";

/** Debounced push of `last-actives` to the per-document settings. */
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persistLastActives(state: {
  active: string;
  activePast: string[];
}): void {
  const payload = [state.active, ...state.activePast];
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    window.electronAPI.localStoreSet("last-actives", payload);
  }, 400);
}

/** Brings every column's target card into view and persists the active list. */
function scrollColumns(instant: boolean): void {
  const state = useDocument.getState();
  if (state.viewMode === "fullscreen") return;

  const activeTree = getTree(state.active, state.tree);
  if (!activeTree || state.tree.id === state.active) return;

  const scrollPositions = getScrollPositions(activeTree, state.activePast, state.tree);
  const colIdx = getDepth(0, state.tree, state.active);
  applyScroll(scrollPositions, colIdx, instant);
  persistLastActives({ active: state.active, activePast: state.activePast });
}

/**
 * Tracks the document viewport. Columns are mounted whenever `viewMode` is not
 * `fullscreen`; the hook guards every DOM read on that.
 */
export function useScrollEffects(): void {
  const tree = useDocument((s) => s.tree);
  const active = useDocument((s) => s.active);
  const activePast = useDocument((s) => s.activePast);
  const viewMode = useDocument((s) => s.viewMode);
  const ready = useDocument((s) => s.ready);

  const initialised = useRef(false);
  const prevViewMode = useRef(viewMode);

  // Startup: instantly restore the saved position.
  useEffect(() => {
    if (!ready || initialised.current) return;
    initialised.current = true;
    scrollColumns(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Activation changes scroll the columns (but not during fullscreen).
  useEffect(() => {
    if (!ready || !initialised.current) return;
    if (viewMode === "fullscreen") return;
    if (viewMode !== "normal") return;
    scrollColumns(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, active, activePast]);

  // Fullscreen / edit-mode transitions.
  useEffect(() => {
    if (!ready || !initialised.current) return;
    const previous = prevViewMode.current;
    prevViewMode.current = viewMode;

    if (viewMode === "fullscreen") {
      // Center the freshly focused card inside the fullscreen column.
      scrollFullscreenTo(active);
      return;
    }
    if (previous === "fullscreen") {
      // Emerging from fullscreen realigns the columns instantly.
      scrollColumns(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, active]);
}