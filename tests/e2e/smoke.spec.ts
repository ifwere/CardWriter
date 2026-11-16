import { test, expect, _electron as electron, ElectronApplication } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const APP_ROOT = path.resolve(__dirname, "..", "..");

let app: ElectronApplication;

test.afterEach(async () => {
  if (app) {
    // `close()` would ask the untitled document to save; exit immediately.
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
});

test("home window renders and opens a new document", async () => {
  app = await electron.launch({ args: [APP_ROOT] });

  const home = await app.firstWindow();
  await home.waitForLoadState("domcontentloaded");

  // The Home window must be rendered by the React bundle.
  await expect(home.locator('#container[data-renderer="react"]')).toBeVisible();

  const newTile = home.locator("#template-new");
  await expect(newTile).toBeVisible();

  const nextWindow = app.waitForEvent("window");
  await newTile.click();

  const doc = await nextWindow;
  await doc.waitForLoadState("domcontentloaded");

  // The document app renders an editable card textarea.
  await expect(doc.locator("textarea").first()).toBeVisible();
  await expect(doc.locator("#file-save-indicator")).toBeVisible();
});

async function openHelpWindow(menuId: string) {
  const nextWindow = app.waitForEvent("window");
  await app.evaluate(({ Menu, BrowserWindow }, id) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) win.focus();
    const item = Menu.getApplicationMenu()?.getMenuItemById(id);
    if (!item) throw new Error(`menu item ${id} not found`);

    // Simulate a menu click: Electron passes the focused window and its web
    // contents to the template handler. The types require all three
    // arguments, so call through a narrower signature.
    const click = item.click as unknown as (
      event: unknown,
      window: unknown,
      contents: unknown
    ) => void;
    const contents = win && !win.isDestroyed() ? win.webContents : undefined;
    click(undefined, win, contents);
  }, menuId);
  const modal = await nextWindow;
  await modal.waitForLoadState("domcontentloaded");
  return modal;
}

test("help windows are rendered by React", async () => {
  app = await electron.launch({ args: [APP_ROOT] });

  const home = await app.firstWindow();
  await expect(home.locator('#container[data-renderer="react"]')).toBeVisible();

  const shortcuts = await openHelpWindow("help-shortcuts");
  await expect(shortcuts.locator("#shortcut-modes-wrapper")).toBeVisible();
  await expect(shortcuts.locator(".shortcut-table")).toHaveCount(7);
  await expect(shortcuts.locator(".shortcut-key").first()).toBeVisible();

  const videos = await openHelpWindow("help-videos");
  await expect(videos.locator("#video-viewer-list .video-item")).toHaveCount(4);
  await expect(videos.locator(".video-item.active-video")).toHaveText("Navigation Basics (45s)");
  await expect(videos.locator("#video-container iframe")).toHaveCount(1);

  const support = await openHelpWindow("help-support");
  await expect(support.locator("#contact-form")).toBeVisible();
  await expect(support.locator("#contact-subject")).toHaveValue("Could you help me with this?");
  await expect(support.locator("#contact-send")).toBeVisible();

  await support.locator("#contact-urgency-urgent").check();
  await expect(support.locator(".modal.red-alert")).toHaveCount(1);
});

test("typing into a new card updates the document", async () => {
  app = await electron.launch({ args: [APP_ROOT] });

  const home = await app.firstWindow();
  await expect(home.locator('#container[data-renderer="react"]')).toBeVisible();
  await expect(home.locator("#template-new")).toBeVisible();

  const nextWindow = app.waitForEvent("window");
  await home.locator("#template-new").click();
  const doc = await nextWindow;

  const textarea = doc.locator("textarea").first();
  await expect(textarea).toBeVisible();
  await textarea.fill("Hello from the smoke test");
  await expect(textarea).toHaveValue("Hello from the smoke test");
});

/** Opens a fresh untitled document in the launched app. */
async function openNewDocument() {
  const home = await app.firstWindow();
  await expect(home.locator('#container[data-renderer="react"]')).toBeVisible();

  const nextWindow = app.waitForEvent("window");
  await home.locator("#template-new").click();
  const doc = await nextWindow;
  await doc.waitForLoadState("domcontentloaded");
  await expect(doc.locator("textarea").first()).toBeVisible();
  return doc;
}

test("the document window is rendered by React", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  // No Elm runtime and no Elm bundle: the page loads only editor.js.
  const scripts = await doc.evaluate(() =>
    Array.from(document.querySelectorAll("script")).map((s) => s.getAttribute("src"))
  );
  expect(scripts).toEqual(["./editor.js"]);
  expect(await doc.evaluate(() => "Elm" in window)).toBe(false);

  await expect(doc.locator("#desktop-root")).toBeVisible();
  await expect(doc.locator("#document #column-container .column")).toHaveCount(1);
  await expect(doc.locator("#file-save-indicator")).toHaveText("All Changes Saved");
});

test("saving a card renders Markdown and shows the breadcrumb", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  await doc.locator("textarea").first().fill("# Heading\n\nSome **bold** text");
  await doc.keyboard.press("Control+Enter");

  const card = doc.locator("#card-1");
  await expect(card).toHaveClass(/card active/);
  await expect(card).not.toHaveClass(/editing/);
  await expect(card.locator(".view h1")).toHaveText("Heading");
  await expect(card.locator(".view strong")).toHaveText("bold");

  await expect(doc.locator("#breadcrumbs div span").last()).toHaveText("# Heading");
});

test("inserting a child card creates a second column", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  await doc.locator("textarea").first().fill("Root");
  await doc.keyboard.press("Control+Enter");
  await doc.keyboard.press("Control+L");

  // A new empty card is opened for editing in the next column.
  await expect(doc.locator("#column-container .column")).toHaveCount(2);
  const child = doc.locator("#column-container .column").nth(1).locator("textarea");
  await expect(child).toBeFocused();

  await child.fill("Child");
  await doc.keyboard.press("Control+Enter");
  await expect(
    doc.locator("#column-container .column").nth(1).locator(".card .view")
  ).toHaveText("Child");

  // The parent keeps its content and is marked as an ancestor.
  await expect(doc.locator("#card-1")).toHaveClass(/ancestor/);
  await expect(doc.locator("#card-1 .view")).toHaveText("Root");
});

test("keyboard navigation moves the active card", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  await doc.locator("textarea").first().fill("Root");
  await doc.keyboard.press("Control+Enter");
  await doc.keyboard.press("Control+L");
  await doc.locator("textarea").first().fill("Child");
  await doc.keyboard.press("Control+Enter");

  // The child is active; `ArrowLeft` goes back to the parent.
  await expect(doc.locator(".card.active .view")).toHaveText("Child");
  await doc.keyboard.press("ArrowLeft");
  await expect(doc.locator(".card.active .view")).toHaveText("Root");

  // `ArrowRight` returns to the (most recently active) child.
  await doc.keyboard.press("ArrowRight");
  await expect(doc.locator(".card.active .view")).toHaveText("Child");
});

test("the export menu previews and exports the document", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  // The export menu lays its two toggle groups out at fixed widths (4 × 150px
  // + 4 × 100px), so it needs more than the 800px default window to fit. This
  // matches the Elm build, which shares the same stylesheet.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) =>
      w.webContents.getURL().includes("renderer.html")
    );
    win?.setContentSize(1200, 800);
  });

  await doc.locator("textarea").first().fill("Exportable");
  await doc.keyboard.press("Control+Enter");

  await app.evaluate(({ Menu, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    const item = Menu.getApplicationMenu()?.getMenuItemById("file-export");
    if (!item) throw new Error("export menu item not found");
    (item.click as unknown as (e: unknown, w: unknown) => void)(undefined, win);
  });

  const preview = doc.locator("#export-preview");
  await expect(preview).toBeVisible();
  await expect(preview.locator(".plain")).toHaveText("Exportable");

  // Switching to JSON changes the preview and the extension.
  await doc.locator("#export-format-json").click();
  await expect(preview.locator(".plain")).toContainText('"content": "Exportable"');

  await expect(doc.locator("#export-menu")).toBeVisible();
  await doc.locator("#export-button-close").click();
  await expect(doc.locator("#export-preview")).toHaveCount(0);
});

test("fullscreen editing replaces the columns", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  await doc.locator("textarea").first().fill("Fullscreen text");
  await doc.keyboard.press("Control+Enter");

  await doc.keyboard.press("Shift+Enter");
  await expect(doc.locator("#app-fullscreen")).toBeVisible();
  await expect(doc.locator("#fullscreen-buttons")).toBeVisible();
  await expect(doc.locator("#column-container")).toHaveCount(0);
  await expect(doc.locator("#app-fullscreen textarea")).toHaveValue("Fullscreen text");

  await doc.locator("#fullscreen-exit").click();
  await expect(doc.locator("#column-container")).toBeVisible();
});

test("navigating a tall column scrolls it to keep the active card in view", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  // Seed the first card, then build a tall column by inserting siblings.
  await doc.locator("textarea").first().fill("Seed");
  await doc.keyboard.press("Control+Enter");
  for (let i = 0; i < 40; i++) {
    await doc.keyboard.press("Control+j"); // insert below (opens editing)
    await doc.keyboard.press("Control+Enter"); // save
  }

  const column = doc.locator("#column-container > .column").first();
  await expect(column.locator(".card")).toHaveCount(41);

  // Walking down must push the column down with the active card. Start from the
  // top so the delta is unambiguous.
  await doc.keyboard.press("Home");
  await doc.waitForTimeout(600);
  const initial = await column.evaluate((el) => el.scrollTop);
  for (let i = 0; i < 40; i++) await doc.keyboard.press("ArrowDown");
  await doc.waitForTimeout(600); // let the 250 ms scroll tween settle
  const atBottom = await column.evaluate((el) => el.scrollTop);
  expect(atBottom).toBeGreaterThan(initial);

  // Walking back up restores the top.
  for (let i = 0; i < 40; i++) await doc.keyboard.press("ArrowUp");
  await doc.waitForTimeout(600);
  const atTop = await column.evaluate((el) => el.scrollTop);
  expect(atTop).toBeLessThan(atBottom);
});

test("the version-history slider lists commits and restores one", async () => {
  app = await electron.launch({ args: [APP_ROOT] });
  const doc = await openNewDocument();

  // Two commits: an initial empty one and one carrying card A.
  await doc.locator("textarea").first().fill("Wanted Old");
  await doc.keyboard.press("Control+Enter");
  await doc.waitForTimeout(4500); // commit throttle (3 s) + margin

  // Add a second, newer commit.
  await doc.keyboard.press("Control+j"); // insert below (editing)
  await doc.locator("textarea").first().fill("Newest Card");
  await doc.keyboard.press("Control+Enter");
  await doc.waitForTimeout(4500);

  // Open the history menu. Its slider tracks the saved commits.
  await doc.locator("#history-icon").click();
  await expect(doc.locator("#history-menu")).toBeVisible();
  const rangeMax = Number(await doc.locator("#history-slider").evaluate((el) => el.max));
  expect(rangeMax).toBeGreaterThanOrEqual(1);

  // Move the slider to the oldest commit (0) and restore it.
  await doc.locator("#history-slider").evaluate((el) => {
    el.value = "0";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(doc.locator("#history-time-info")).toBeVisible();
  await doc.locator("#history-restore").click();

  // Restoring replaces the working tree with the oldest commit's content.
  await expect(doc.locator("#history-menu")).toHaveCount(0);
  await expect(doc.locator("#column-container .card .view").first()).toContainText(
    "Wanted Old"
  );
});

test("a legacy .gko file opens as text and renders its cards", async () => {
  // Write a Gingko Desktop legacy file: a plain markdown outline. The app
  // reads .gko as text (no format conversion) and renders it exactly like a
  // .gkw. A real outline is rootless: it holds the cards directly.
  const gkoPath = path.join(os.tmpdir(), `legacy-${Date.now()}.gko`);
  fs.writeFileSync(
    gkoPath,
    "<gingko-card id=\"1\">\n\nLegacy Gingko Card\n\n</gingko-card>\n",
    "utf-8"
  );

  app = await electron.launch({ args: [APP_ROOT, gkoPath] });

  // Launching with a file opens the document window directly (no Home). A
  // persisted document starts in the read ("normal") view, so the card renders
  // as a `.view` (not a textarea) until a card is opened for editing.
  const doc = await app.firstWindow();
  await doc.waitForLoadState("domcontentloaded");

  // The React renderer must have parsed the .gko outline into a card.
  await expect(doc.locator("#column-container .card .view").first()).toContainText(
    "Legacy Gingko Card"
  );

  // And it is editable: opening the card turns the view into a textarea.
  await doc.locator("#column-container .card .view").first().dblclick();
  await expect(doc.locator("textarea").first()).toHaveValue("Legacy Gingko Card");

  fs.unlinkSync(gkoPath);
});
