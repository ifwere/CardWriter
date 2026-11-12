import { test, expect, _electron as electron, ElectronApplication } from "@playwright/test";
import path from "node:path";

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
    // Electron types require the (item, window, event) arguments, but the
    // template handlers only read the window. Invoking with none opens the
    // help window without a parent.
    (item.click as unknown as () => void)();
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
