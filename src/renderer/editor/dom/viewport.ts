// Viewport scrolling and fillet geometry.
//
// Port of the desktop helpers in the legacy renderer (`scrollColumns`,
// `scrollHorizTo`, `scrollFullscreenTo`, `updateFillets`). It reads the same
// DOM ids and class names so `style.css` keeps working without change:
//   * `#document` scrolls horizontally to center a column
//   * each `.column` scrolls vertically to bring a card into view
//   * `.fillet` elements get their offset/height/flip recomputed when the
//     active card sits next to a neighbour column
// The legacy code animated through GSAP; here a tiny rAF tween with the same
// durations (250 ms vertical, 300 ms horizontal) and a Power2-style ease
// replaces it, keeping the renderer bundle free of a GSAP dependency.

import type { ColumnScroll } from "../model/treeView.ts";

type Shorthand = "center" | "top" | "bottom";

function columnElement(oneBasedIndex: number): HTMLElement | null {
  const cols = document.getElementsByClassName("column");
  return (cols[oneBasedIndex - 1] as HTMLElement | undefined) ?? null;
}

function cardElement(id: string): HTMLElement | null {
  return document.getElementById(`card-${id}`);
}

/** Cubic ease-in-out, close to GSAP's `Power2.easeInOut`. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Animates `el.scrollTop`/`el.scrollLeft` to `target` over `ms`. */
function animateScroll(el: HTMLElement, target: number, vertical: boolean, ms: number): void {
  const from = vertical ? el.scrollTop : el.scrollLeft;
  const delta = target - from;
  if (delta === 0) return;

  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    const value = from + delta * easeInOut(t);
    if (vertical) el.scrollTop = value;
    else el.scrollLeft = value;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Vertically scrolls the column so a card lands at `position` (top / center /
 * bottom), matching the legacy `scrollTo`. For cards taller than the viewport
 * it aligns to the card's top rather than its middle.
 */
function scrollTo(
  cardId: string,
  instant: boolean,
  position: Shorthand,
  el: HTMLElement
): void {
  const card = cardElement(cardId);
  const doc = document.getElementById("document");
  if (!card || !doc) return;

  const docRect = doc.getBoundingClientRect();
  const rect = card.getBoundingClientRect();
  const multiplier = position === "top" ? 0 : position === "center" ? 0.5 : 1;
  const adjustedHeight =
    rect.height > docRect.height - 51 ? docRect.height * 0.5 + 51 : rect.height;

  const target = el.scrollTop + (rect.top + adjustedHeight * multiplier - (docRect.top + docRect.bottom) * 0.5);

  if (instant) el.scrollTop = target;
  else animateScroll(el, target, true, 250);
}

/** Shorthand position for a scroll target, like the legacy switch. */
function shorthand(scrollData: ColumnScroll["scrollData"]): Shorthand {
  switch (scrollData.position) {
    case "Center":
      return "center";
    case "After":
    case "Between":
      return "bottom";
    case "Before":
      return "top";
    default:
      return "center";
  }
}

/**
 * Applies a batch of per-column scrolls plus the horizontal scroll, then
 * re-runs fillet geometry. Mirrors the desktop `ScrollCards` handler.
 */
export function applyScroll(
  columns: ColumnScroll[],
  columnIdx: number,
  instant: boolean
): void {
  for (const column of columns) {
    if (column.scrollData.position === "None") continue;
    const el = columnElement(column.columnIdx);
    if (!el) continue;
    scrollTo(column.scrollData.target, instant, shorthand(column.scrollData), el);
  }

  // Horizontally center the active card's column.
  const activeColumn = columnElement(columnIdx);
  const doc = document.getElementById("document");
  if (activeColumn && doc) {
    const target = activeColumn.offsetLeft + 0.5 * (activeColumn.offsetWidth - doc.offsetWidth);
    if (instant) doc.scrollLeft = target;
    else {
      // Disable CSS scroll-snap during the animation (the legacy `scroll-animation`
      // class); re-enable on completion.
      doc.classList.add("scroll-animation");
      const finish = () => doc.classList.remove("scroll-animation");
      const from = doc.scrollLeft;
      const delta = target - from;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 300);
        doc.scrollLeft = from + delta * easeInOut(t);
        if (t < 1) requestAnimationFrame(step);
        else finish();
      };
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(updateFillets);
}

/** Scrolls `#fullscreen-main` so the active card is vertically centered. */
export function scrollFullscreenTo(cardId: string): void {
  const card = cardElement(cardId);
  const col = document.getElementById("fullscreen-main");
  if (!card || !col) return;

  const rect = card.getBoundingClientRect();
  const target = col.scrollTop + (rect.top + rect.height * 0.5 - col.offsetHeight * 0.5);
  animateScroll(col, target, true, 250);
}

interface TopBottom {
  top: number;
  bottom: number;
}

/** Per-column active-region top/bottom for fillet placement. */
function getFilletData(columns: HTMLElement[]): (TopBottom | null)[] {
  return columns.map((col) => {
    const activeCard = col.getElementsByClassName("card active")[0] as HTMLElement | undefined;
    if (activeCard) {
      const r = activeCard.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    }
    const activeGroups = col.getElementsByClassName("group active-descendant") as
      | HTMLCollectionOf<HTMLElement>
      | undefined;
    if (activeGroups && activeGroups.length > 0) {
      const first = activeGroups[0].getBoundingClientRect();
      const last = activeGroups[activeGroups.length - 1].getBoundingClientRect();
      return { top: first.top, bottom: last.bottom };
    }
    return null;
  });
}

function setTop(el: HTMLElement, delta: number): void {
  if (delta > 0) {
    el.style.height = `${delta}px`;
    el.style.top = `-${delta}px`;
    el.classList.remove("flipped");
  } else {
    el.style.height = `${-delta}px`;
    el.style.top = "0";
    el.classList.add("flipped");
  }
}

function setBottom(el: HTMLElement, delta: number): void {
  if (delta > 0) {
    el.style.height = `${delta}px`;
    el.style.bottom = "0";
    el.classList.add("flipped");
  } else {
    el.style.height = `${-delta}px`;
    el.style.bottom = `${delta}px`;
    el.classList.remove("flipped");
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

function setColumnFillets(col: HTMLElement, idx: number, data: (TopBottom | null)[]): void {
  const prev = data[idx - 1];
  const curr = data[idx];
  const next = data[idx + 1];

  if (prev == null && curr != null && next != null) {
    // Active card: adjust the two fillets that link to the next column.
    const activeCard = col.getElementsByClassName("card active")[0] as HTMLElement | undefined;
    if (!activeCard) return;
    const topDelta = clamp((curr.top - next.top) * 0.5, -16, 16);
    const bottomDelta = clamp((curr.bottom - next.bottom) * 0.5, -16, 16);
    const fillets = activeCard.getElementsByClassName("fillet");
    const top = fillets[0] as HTMLElement | undefined;
    const bottom = fillets[1] as HTMLElement | undefined;
    if (top && bottom) {
      top.style.display = "block";
      bottom.style.display = "block";
      setTop(top, topDelta);
      setBottom(bottom, bottomDelta);
    }
  } else if (curr != null && prev != null) {
    // Active descendant: adjust the column's surrounding fillets.
    const topLeftDelta = clamp((curr.top - prev.top) * 0.5, -16, 16);
    const bottomLeftDelta = clamp(curr.bottom - prev.bottom, -16, 16);

    const topLefts = col.getElementsByClassName("fillet top-left") as HTMLCollectionOf<HTMLElement>;
    const bottomLefts = col.getElementsByClassName("fillet bottom-left") as HTMLCollectionOf<HTMLElement>;
    const filletTopLeft = topLefts[0];
    const filletBottomLeft = bottomLefts[bottomLefts.length - 1];

    if (filletTopLeft && filletBottomLeft) {
      filletTopLeft.style.display = "block";
      filletBottomLeft.style.display = "block";
      for (let i = 0; i < topLefts.length; i++) topLefts[i].style.display = i === 0 ? "" : "none";
      for (let i = 0; i < bottomLefts.length; i++)
        bottomLefts[i].style.display = i === bottomLefts.length - 1 ? "" : "none";
      setTop(filletTopLeft, topLeftDelta);
      setBottom(filletBottomLeft, bottomLeftDelta);
    }

    const topRights = col.getElementsByClassName("fillet top-right") as HTMLCollectionOf<HTMLElement>;
    const bottomRights = col.getElementsByClassName("fillet bottom-right") as HTMLCollectionOf<HTMLElement>;
    const filletTopRight = topRights[0];
    const filletBottomRight = bottomRights[bottomRights.length - 1];
    if (filletTopRight && filletBottomRight) {
      if (next != null) {
        filletTopRight.style.display = "block";
        filletBottomRight.style.display = "block";
        const topRightDelta = clamp((curr.top - next.top) * 0.5, -16, 16);
        const bottomRightDelta = clamp((curr.bottom - next.bottom) * 0.5, -16, 16);
        setTop(filletTopRight, topRightDelta);
        setBottom(filletBottomRight, bottomRightDelta);
      } else {
        filletTopRight.style.display = "none";
        filletBottomRight.style.display = "none";
      }
    }
  }
}

/** Recomputes fillet offsets after the active card or scroll position changes. */
export function updateFillets(): void {
  const columns = Array.from(document.getElementsByClassName("column")) as HTMLElement[];
  const data = getFilletData(columns);
  columns.forEach((col, i) => setColumnFillets(col, i, data));
}