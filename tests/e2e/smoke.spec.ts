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
