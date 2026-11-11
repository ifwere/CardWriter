"use strict";

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const crypto = require("node:crypto");

const Store = require("./store");
const VersionStore = require("./version-store");
const commitTree = require("./commit");
const exportDocx = require("./pandoc");
const { getHomeMenuTemplate, getDocMenuTemplate } = require("./menu");
const { debounce, groupBy, omit, versionDirName } = require("./util");

app.setName("CardWriter");

const isMac = process.platform === "darwin";

/** @type {Map<import("electron").BrowserWindow, DocWindowData>} */
const docWindows = new Map();
/** @type {Map<string, ReturnType<typeof debounce>>} */
const localStoreWriters = new Map();

let homeWindow = null;
let settingsStore = null;
let recentDocuments = [];
let pendingOpenPath = null;
let elmWorker = null;

/**
 * @typedef {object} DocWindowData
 * @property {string} filePath
 * @property {boolean} isUntitled
 * @property {import("node:fs/promises").FileHandle|null} swapFileHandle
 * @property {VersionStore|null} versionStore
 * @property {Set<string>} savedImmutables
 */

/* ================= Settings ================= */

function settings() {
  if (!settingsStore) {
    settingsStore = new Store(path.join(app.getPath("userData"), "settings.json"));
  }
  return settingsStore;
}

function recentPaths() {
  return recentDocuments.map((entry) => entry.path);
}

/* ================= Menus ================= */

function applyMenu(template) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function helpHandlers() {
  return {
    clickedShowShortcuts: (item, win) => clickedShowShortcuts(win),
    clickedHelpVideos: (item, win) => clickedHelpVideos(win),
    clickedFAQ: (item, win) => clickedFAQ(win),
    clickedContactSupport: (item, win) => clickedContactSupport(win)
  };
}

function homeMenuHandlers() {
  return {
    ...helpHandlers(),
    clickedNew: (item, focusedWindow) => {
      createDocWindow(null);
      destroyWindow(focusedWindow || homeWindow);
    },
    clickedOpen: (item, focusedWindow) => {
      openDocumentFromDialog(focusedWindow || homeWindow).then((opened) => {
        if (opened) destroyWindow(focusedWindow || homeWindow);
      });
    },
    clickedRecentDoc: (item, focusedWindow, openPath) => {
      createDocWindow(openPath);
      destroyWindow(focusedWindow || homeWindow);
    }
  };
}

function docMenuHandlers() {
  return {
    ...helpHandlers(),
    clickedNew: () => createDocWindow(null),
    clickedOpen: (item, focusedWindow) => openDocumentFromDialog(focusedWindow),
    clickedRecentDoc: (item, focusedWindow, openPath) => createDocWindow(openPath),
    clickedSaveAs: (item, focusedWindow) => saveDocumentAs(focusedWindow),
    clickedExport: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-export"),
    clickedClose: (item, focusedWindow) => (focusedWindow || BrowserWindow.getFocusedWindow())?.close(),
    clickedUndo: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-undo"),
    clickedCut: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-cut"),
    clickedCopy: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-copy"),
    clickedPaste: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-paste"),
    clickedPasteInto: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-paste-into"),
    clickedExit: () => app.quit()
  };
}

function buildHomeMenu() {
  applyMenu(
    getHomeMenuTemplate(homeMenuHandlers(), {
      isMac,
      recentDocuments: recentPaths(),
      appName: app.getName()
    })
  );
}

function buildDocMenu(win, isEditMode = true) {
  const winData = docWindows.get(win);
  applyMenu(
    getDocMenuTemplate(docMenuHandlers(), {
      isMac,
      isUntitled: Boolean(winData?.isUntitled),
      recentDocuments: recentPaths(),
      appName: app.getName(),
      isEditMode
    })
  );
}

function refreshMenus() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && docWindows.has(focused)) buildDocMenu(focused);
  else buildHomeMenu();
}

function sendToDoc(win, channel) {
  const target = win || BrowserWindow.getFocusedWindow();
  if (target && docWindows.has(target) && !target.isDestroyed()) {
    target.webContents.send(channel);
  }
}

/* ================= Home window ================= */

function createHomeWindow() {
  if (homeWindow && !homeWindow.isDestroyed()) {
    homeWindow.focus();
    return homeWindow;
  }

  buildHomeMenu();

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 520,
    minHeight: 400,
    show: false,
    backgroundColor: "hsl(202deg 62% 92%)",
    title: "CardWriter",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  homeWindow = win;
  win.loadFile(path.join(__dirname, "static", "home.html"));

  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.webContents.send("file-received", {
      recentDocuments,
      language: settings().get("language", "en"),
      currentTime: Date.now()
    });
  });

  win.once("ready-to-show", () => win.show());
  win.on("page-title-updated", (event) => event.preventDefault());
  win.on("focus", () => buildHomeMenu());
  win.on("closed", () => {
    if (homeWindow === win) homeWindow = null;
  });

  return win;
}

function destroyWindow(win) {
  if (!win || win.isDestroyed()) return;
  win.destroy();
}

/* ================= Document window ================= */

function tempUntitledPath() {
  const d = new Date();
  const hash = crypto.randomBytes(3).toString("hex");
  return path.join(app.getPath("temp"), `Untitled-${d.toISOString().slice(0, 10)}-${hash}.gkw`);
}

function versionStoreDir(filePath) {
  return path.join(app.getPath("userData"), "versionhistory", versionDirName(filePath));
}

function getTitleText(winData) {
  return `${path.basename(winData.filePath)} - CardWriter`;
}

function objectsToElmData(objects) {
  return groupBy(objects, (obj) =>
    Object.prototype.hasOwnProperty.call(obj, "type") ? obj.type : obj._id
  );
}

/**
 * Creates (or focuses) a document window.
 *
 * @param {string|null} filePath null for an untitled document
 * @param {string|null} [initFileData] Markdown content for a new document
 */
function createDocWindow(filePath, initFileData = null) {
  const isUntitled = filePath === null;
  const actualPath = isUntitled ? tempUntitledPath() : path.resolve(filePath);

  if (!isUntitled) {
    for (const [openWin, winData] of docWindows) {
      if (winData.filePath === actualPath && !openWin.isDestroyed()) {
        openWin.focus();
        return openWin;
      }
    }
  }

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 420,
    minHeight: 320,
    show: false,
    backgroundColor: "hsl(202, 72%, 41%)",
    title: "CardWriter",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const winData = {
    filePath: actualPath,
    isUntitled,
    isEditMode: isUntitled,
    swapFileHandle: null,
    versionStore: null,
    savedImmutables: new Set()
  };
  docWindows.set(win, winData);

  buildDocMenu(win, isUntitled);
  win.loadFile(path.join(__dirname, "static", "renderer.html"));

  win.webContents.once("did-finish-load", async () => {
    try {
      await prepareDocument(win, winData, initFileData);
    } catch (error) {
      console.error("[doc] failed to prepare document", error);
      dialog.showErrorBox("Could not open document", String(error && error.message ? error.message : error));
      win.destroy();
    }
  });

  win.once("ready-to-show", () => win.show());
  win.on("page-title-updated", (event) => event.preventDefault());
  win.on("focus", () => buildDocMenu(win, winData.isEditMode));
  win.on("closed", () => {
    docWindows.delete(win);
    void cleanupDocument(winData, true);
  });

  return win;
}

async function prepareDocument(win, winData, initFileData) {
  const { filePath, isUntitled } = winData;
  let fileData = null;

  if (isUntitled) {
    const initialContent = typeof initFileData === "string" ? initFileData : "";
    await fsp.writeFile(filePath, initialContent, "utf-8");
    await fsp.writeFile(filePath + ".swp", initialContent, "utf-8");
    winData.swapFileHandle = await fsp.open(filePath + ".swp", "r+");
    if (typeof initFileData === "string") fileData = initFileData;
  } else {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file");

    const d = new Date();
    const hash = crypto.createHash("sha1").update(`${Date.now()}`).digest("hex").slice(0, 6);
    const backupPath = path.join(
      app.getPath("temp"),
      `${path.basename(filePath, ".gkw")}-${d.toISOString().slice(0, 10)}-${hash}.gkw.bak`
    );

    await fsp.copyFile(filePath, backupPath);
    await fsp.copyFile(filePath, filePath + ".swp");

    winData.swapFileHandle = await fsp.open(filePath + ".swp", "r+");
    fileData = await winData.swapFileHandle.readFile({ encoding: "utf8" });

    await addToRecentDocuments(filePath);
  }

  const storeDir = versionStoreDir(filePath);
  winData.versionStore = new VersionStore(storeDir);

  const undoData = [];
  for await (const [key, value] of winData.versionStore.iterator()) {
    try {
      const parsed = JSON.parse(String(value));
      undoData.push(Object.assign({ _id: String(key) }, parsed));
    } catch (error) {
      console.error("[doc] skipping corrupt version object", key, error.message);
    }
  }

  const fileSettings = settings().get(filePath, null);

  win.setTitle(getTitleText(winData));
  win.webContents.send("file-received", {
    filePath,
    fileData,
    fileSettings,
    undoData: objectsToElmData(undoData),
    isUntitled
  });

  buildDocMenu(win, isUntitled);
}

async function cleanupDocument(winData, removeSwapFile) {
  try {
    if (winData.swapFileHandle) {
      await winData.swapFileHandle.close().catch(() => {});
      winData.swapFileHandle = null;
    }
    if (winData.versionStore) {
      await winData.versionStore.close().catch(() => {});
      winData.versionStore = null;
    }
    if (removeSwapFile) {
      await fsp.unlink(winData.filePath + ".swp").catch(() => {});
    }
    const writer = localStoreWriters.get(winData.filePath);
    if (writer) {
      writer.flush();
      localStoreWriters.delete(winData.filePath);
    }
  } catch (error) {
    console.error("[doc] cleanup failed", error);
  }
}

async function openDocumentFromDialog(win, focusNewWindow = false) {
  const options = {
    properties: ["openFile", "multiSelections"],
    defaultPath: app.getPath("documents"),
    filters: [
      { name: "CardWriter Document", extensions: ["gkw"] },
      { name: "Gingko Desktop Legacy", extensions: ["gko"] },
      { name: "Markdown Document", extensions: ["md"] },
      { name: "All Files", extensions: ["*"] }
    ]
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) return false;

  for (const docPath of result.filePaths) {
    const docWin = createDocWindow(docPath);
    if (focusNewWindow && docWin) docWin.focus();
  }
  return true;
}

/**
 * "Save As": copies the document (and its version history) to a new path.
 *
 * @param {import("electron").BrowserWindow|null} win
 */
async function saveDocumentAs(win) {
  const targetWindow = win || BrowserWindow.getFocusedWindow();
  if (!targetWindow) return false;
  const winData = docWindows.get(targetWindow);
  if (!winData) return false;

  const origPath = winData.filePath;
  const defaultPath = origPath.startsWith(app.getPath("temp")) ? app.getPath("documents") : origPath;

  const { filePath: newPath, canceled } = await dialog.showSaveDialog(targetWindow, {
    defaultPath,
    filters: [
      { name: "CardWriter Document", extensions: ["gkw"] },
      { name: "Markdown Document", extensions: ["md"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });
  if (canceled || !newPath) return false;

  if (newPath === origPath) return false;

  // Close the swap handle before copying the document around.
  if (winData.swapFileHandle) {
    await winData.swapFileHandle.close().catch(() => {});
    winData.swapFileHandle = null;
  }

  // The last saved state lives in the original .swp file, which is copied
  // over the document whenever a save happens. Use it as the source.
  const sourcePath = fs.existsSync(origPath + ".swp") ? origPath + ".swp" : origPath;
  await fsp.copyFile(sourcePath, newPath);
  await fsp.copyFile(sourcePath, newPath + ".swp");

  winData.filePath = newPath;
  winData.isUntitled = false;
  winData.swapFileHandle = await fsp.open(newPath + ".swp", "r+");

  const oldWriter = localStoreWriters.get(origPath);
  if (oldWriter) {
    oldWriter.flush();
    localStoreWriters.delete(origPath);
  }
  if (origPath !== newPath && origPath.startsWith(app.getPath("temp"))) {
    await fsp.rm(origPath, { force: true }).catch(() => {});
    await fsp.rm(origPath + ".swp", { force: true }).catch(() => {});
  }

  // Move the version history to the new path.
  const oldStoreDir = versionStoreDir(origPath);
  const newStoreDir = versionStoreDir(newPath);
  if (winData.versionStore) {
    await winData.versionStore.close().catch(() => {});
    winData.versionStore = null;
  }
  await fsp.mkdir(path.dirname(newStoreDir), { recursive: true });
  if (fs.existsSync(oldStoreDir)) {
    await fsp.cp(oldStoreDir, newStoreDir, { recursive: true });
    await fsp.rm(oldStoreDir, { recursive: true, force: true });
  }
  winData.versionStore = new VersionStore(newStoreDir);

  // Move per-document UI settings.
  const oldSettings = settings().get(origPath, null);
  if (oldSettings) {
    settings().set(newPath, oldSettings);
    settings().delete(origPath);
  }

  await addToRecentDocuments(newPath);

  targetWindow.setTitle(getTitleText(winData));
  buildDocMenu(targetWindow, false);

  targetWindow.webContents.send("file-saved", [newPath, Date.now(), false]);
  return true;
}

/* ================= Recent documents ================= */

async function addToRecentDocuments(filePath) {
  try {
    if (isMac) app.addRecentDocument(filePath);
    const stat = await fsp.stat(filePath);
    const entry = {
      name: path.basename(filePath, path.extname(filePath)),
      path: filePath,
      birthtimeMs: stat.birthtimeMs,
      atimeMs: Date.now(),
      mtimeMs: stat.mtimeMs
    };
    recentDocuments = recentDocuments.filter((rd) => rd.path !== filePath).concat(entry);
    settings().set("recentDocuments", recentDocuments);
    refreshMenus();
  } catch (error) {
    console.error("[recent] could not add", filePath, error.message);
  }
}

function removeFromRecentDocuments(filePath) {
  recentDocuments = recentDocuments.filter((rd) => rd.path !== filePath);
  settings().set("recentDocuments", recentDocuments);
  if (isMac) {
    app.clearRecentDocuments();
    for (const entry of recentDocuments) app.addRecentDocument(entry.path);
  }
  refreshMenus();
}

/* ================= Help windows ================= */

function openHelpWindow(parent, { file, ...options }) {
  const win = new BrowserWindow({
    parent: parent || undefined,
    backgroundColor: "hsl(202, 34%, 96%)",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    ...options
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "static", file));
  return win;
}

function clickedShowShortcuts(win) {
  openHelpWindow(win, { width: 1000, height: 800, file: "shortcuts-modal.html" });
}

function clickedHelpVideos(win) {
  openHelpWindow(win, { width: 800, height: 400, resizable: false, file: "videos-modal.html" });
}

function clickedFAQ(win) {
  openHelpWindow(win, { width: 445, height: 600, resizable: false, file: "faq-modal.html" });
}

function clickedContactSupport(win) {
  openHelpWindow(win, { width: 800, height: 445, backgroundColor: "#ffffff", file: "support-modal.html" });
}

/* ================= Import ================= */

async function importJson(win, fromHomePage) {
  const options = {
    properties: ["openFile"],
    defaultPath: app.getPath("documents"),
    filters: [{ name: "JSON", extensions: ["json"] }]
  };
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return;

  const fileData = await fsp.readFile(result.filePaths[0], "utf-8");
  if (!elmWorker) {
    dialog.showErrorBox("Import Error", "The import worker is not ready.");
    return;
  }
  elmWorker.ports.toElm.send([fileData, Boolean(fromHomePage)]);
}

/* ================= IPC: windows ================= */

ipcMain.on("clicked-new", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  createDocWindow(null);
  if (win === homeWindow) destroyWindow(win);
});

ipcMain.on("clicked-open", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  openDocumentFromDialog(win).then((opened) => {
    if (opened && win === homeWindow) destroyWindow(win);
  });
});

ipcMain.on("clicked-import", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  void importJson(win, win === homeWindow);
});

ipcMain.on("clicked-document", (event, docPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  createDocWindow(docPath);
  if (win === homeWindow) destroyWindow(win);
});

ipcMain.on("clicked-remove-document", (event, docPath) => {
  removeFromRecentDocuments(docPath);
});

ipcMain.on("close-window", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on("maybe-close-window", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;

  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    message: "Do you want to save your changes?",
    title: "Save changes?",
    detail: "This document has not been saved to a file yet.",
    buttons: ["Don't Save", "Cancel", "Save"],
    defaultId: 2,
    cancelId: 1
  });

  if (response === 0) {
    win.destroy();
  } else if (response === 2) {
    const saved = await saveDocumentAs(win);
    if (saved) win.destroy();
  }
});

/* ================= IPC: document ================= */

ipcMain.on("local-store-set", (event, key, value) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const winData = win ? docWindows.get(win) : null;
  if (!winData) return;

  const storeKey = winData.filePath;
  let writer = localStoreWriters.get(storeKey);
  if (!writer) {
    writer = debounce((k, v) => {
      const current = settings().get(storeKey, {}) || {};
      current[k] = v;
      settings().set(storeKey, current);
    }, 827);
    localStoreWriters.set(storeKey, writer);
  }
  writer(key, value);
});

ipcMain.on("save-file", async (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const winData = win ? docWindows.get(win) : null;
  if (!winData || !winData.swapFileHandle) return;

  const content = data[1];
  try {
    const handle = winData.swapFileHandle;
    const { bytesWritten } = await handle.write(content, 0);
    await handle.truncate(bytesWritten);
    await fsp.copyFile(winData.filePath + ".swp", winData.filePath);
    win.webContents.send("file-saved", [winData.filePath, Date.now(), winData.isUntitled]);
    win.setTitle(getTitleText(winData));
  } catch (error) {
    console.error("[save] failed", error);
    dialog.showErrorBox("Could not save document", String(error && error.message ? error.message : error));
  }
});

ipcMain.on("export-file", async (event, data) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const winData = win ? docWindows.get(win) : null;
  if (!winData) return;

  const [extension, content] = data;
  const base = winData.filePath.replace(/\.(gkw|gko|md)$/i, "");
  const defaultPath = base.startsWith(app.getPath("temp"))
    ? path.join(app.getPath("documents"), `Untitled.${extension}`)
    : `${base}.${extension}`;

  const { filePath, canceled } = await dialog.showSaveDialog(win, {
    defaultPath,
    filters: [{ name: extension.toUpperCase(), extensions: [extension] }]
  });
  if (canceled || !filePath) return;

  try {
    if (extension === "docx") {
      await exportDocx(filePath, content);
    } else {
      await fsp.writeFile(filePath, content, "utf-8");
    }
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: "error",
      title: "Failed to Export",
      message: String(error && error.message ? error.message : error)
    });
  }
});

ipcMain.on("commit-data", async (event, commitData) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const winData = win ? docWindows.get(win) : null;
  if (!winData || !winData.versionStore) return;

  try {
    const [commitSha, objects] = await commitTree(
      commitData.author,
      commitData.parents,
      commitData.workingTree,
      Date.now(),
      commitData.metadata
    );
    objects.push({ _id: "heads/master", type: "ref", value: commitSha, ancestors: [], _rev: "" });

    const ops = objects
      .filter((obj) => !winData.savedImmutables.has(obj._id))
      .map((obj) => ({
        type: "put",
        key: obj._id,
        value: JSON.stringify(omit(obj, ["_id"]))
      }));

    await winData.versionStore.batch(ops);
    for (const op of ops) {
      if (op.key !== "heads/master") winData.savedImmutables.add(op.key);
    }
    win.webContents.send("commit-data-result", objectsToElmData(objects));
  } catch (error) {
    console.error("[commit] failed", error);
  }
});

ipcMain.on("edit-mode-changed", (event, isEditMode) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const winData = win ? docWindows.get(win) : null;
  if (!winData) return;
  winData.isEditMode = Boolean(isEditMode);
  buildDocMenu(win, winData.isEditMode);
});

ipcMain.on("copy-text", (event, text) => {
  clipboard.writeText(String(text ?? ""));
});

ipcMain.handle("read-clipboard", () => clipboard.readText());

ipcMain.on("copy-support-email", (event, isUrgent) => {
  const config = require("./config.js");
  clipboard.writeText(isUrgent ? config.SUPPORT_URGENT_EMAIL : config.SUPPORT_EMAIL);
});

ipcMain.on("open-external", (event, url) => {
  if (typeof url === "string" && /^(https?:|mailto:)/i.test(url)) {
    void shell.openExternal(url);
  }
});

/* ================= External navigation ================= */

app.on("web-contents-created", (event, webContents) => {
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?:|mailto:)/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (/^(https?:|mailto:)/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

/* ================= File association / argv ================= */

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (app.isReady()) {
    createDocWindow(filePath);
  } else {
    pendingOpenPath = filePath;
  }
});

function pathFromArgv(argv) {
  const candidates = app.isPackaged ? argv.slice(1) : argv.slice(2);
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.startsWith("-")) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (event, argv) => {
    const docPath = pathFromArgv(argv);
    if (docPath) createDocWindow(docPath);
    else if (homeWindow && !homeWindow.isDestroyed()) homeWindow.focus();
  });
}

/* ================= App lifecycle ================= */

app.whenReady().then(() => {
  recentDocuments = settings().get("recentDocuments", []) || [];

  const initialPath = pendingOpenPath || pathFromArgv(process.argv);
  pendingOpenPath = null;

  if (initialPath) createDocWindow(initialPath);
  else createHomeWindow();

  // Elm worker for JSON imports.
  try {
    const { Elm } = require("./elm-worker.js");
    elmWorker = Elm.Electron.Worker.init({ flags: Date.now() });
    elmWorker.ports.fromElm.subscribe((elmData) => {
      switch (elmData[0]) {
        case "ImportDone": {
          const imported = elmData[1];
          const win = createDocWindow(null, imported.data);
          if (imported.fromHomePage && homeWindow && !homeWindow.isDestroyed()) destroyWindow(homeWindow);
          if (win) win.focus();
          break;
        }
        case "ImportError":
          dialog.showErrorBox("Import Error", String(elmData[1]));
          break;
      }
    });
  } catch (error) {
    console.error("[import] worker unavailable", error);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createHomeWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

module.exports = { createDocWindow, createHomeWindow };
