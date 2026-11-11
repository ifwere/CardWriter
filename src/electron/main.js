"use strict";

const { app, BrowserWindow, Menu, ipcMain, dialog, shell, clipboard } = require("electron");
const path = require("node:path");
const crypto = require("node:crypto");
const { getHomeMenuTemplate, getDocMenuTemplate } = require("./menu");

app.setName("CardWriter");

const isMac = process.platform === "darwin";

/** @type {Map<import("electron").BrowserWindow, object>} */
const docWindows = new Map();
let homeWindow = null;
let recentDocuments = [];

function applyMenu(template) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ================= Home window ================= */

function homeMenuHandlers() {
  return {
    ...helpHandlers(),
    clickedNew: (item, focusedWindow) => {
      createDocWindow(null);
      destroyHome(focusedWindow);
    },
    clickedOpen: (item, focusedWindow) => {
      openDocumentFromDialog(focusedWindow).then((opened) => {
        if (opened) destroyHome(focusedWindow);
      });
    },
    clickedRecentDoc: (item, focusedWindow, openPath) => {
      createDocWindow(openPath);
      destroyHome(focusedWindow);
    }
  };
}

function buildHomeMenu() {
  applyMenu(
    getHomeMenuTemplate(homeMenuHandlers(), {
      isMac,
      recentDocuments,
      appName: app.getName()
    })
  );
}

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
      language: "en",
      currentTime: Date.now()
    });
  });

  win.once("ready-to-show", () => win.show());
  win.on("page-title-updated", (event) => event.preventDefault());
  win.on("closed", () => {
    if (homeWindow === win) homeWindow = null;
  });

  return win;
}

function destroyHome(win) {
  if (!win || win.isDestroyed()) return;
  win.destroy();
}

/* ================= Document window ================= */

function tempUntitledPath() {
  const d = new Date();
  const hash = crypto.randomBytes(3).toString("hex");
  return path.join(app.getPath("temp"), `Untitled-${d.toISOString().slice(0, 10)}-${hash}.gkw`);
}

function docMenuHandlers() {
  return {
    ...helpHandlers(),
    clickedNew: () => createDocWindow(null),
    clickedOpen: (item, focusedWindow) => openDocumentFromDialog(focusedWindow, true),
    clickedRecentDoc: (item, focusedWindow, openPath) => createDocWindow(openPath),
    clickedSaveAs: (item, focusedWindow) => saveDocumentAs(focusedWindow),
    clickedExport: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-export"),
    clickedClose: (item, focusedWindow) => (focusedWindow || BrowserWindow.getFocusedWindow())?.close(),
    clickedUndo: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-undo"),
    clickedCut: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-cut"),
    clickedCopy: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-copy"),
    clickedPaste: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-paste"),
    clickedPasteInto: (item, focusedWindow) => sendToDoc(focusedWindow, "clicked-paste-into")
  };
}

function sendToDoc(win, channel) {
  const target = win || BrowserWindow.getFocusedWindow();
  if (target && docWindows.has(target) && !target.isDestroyed()) {
    target.webContents.send(channel);
  }
}

function buildDocMenu(win) {
  const winData = docWindows.get(win);
  applyMenu(
    getDocMenuTemplate(docMenuHandlers(), {
      isMac,
      isUntitled: Boolean(winData?.isUntitled),
      recentDocuments,
      appName: app.getName(),
      isEditMode: true
    })
  );
}

/**
 * Creates a document window.
 *
 * @param {string|null} filePath null for an untitled document
 * @param {string|null} [initFileData] Markdown content for a new document
 */
function createDocWindow(filePath, initFileData = null) {
  const isUntitled = filePath === null;
  const actualPath = isUntitled ? tempUntitledPath() : filePath;

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
    savedImmutables: new Set()
  };
  docWindows.set(win, winData);
  buildDocMenu(win);

  win.loadFile(path.join(__dirname, "static", "renderer.html"));

  win.webContents.once("did-finish-load", () => {
    if (win.isDestroyed()) return;
    win.webContents.send("file-received", {
      filePath: actualPath,
      fileData: initFileData,
      fileSettings: null,
      undoData: {},
      isUntitled
    });
  });

  win.once("ready-to-show", () => win.show());
  win.on("page-title-updated", (event) => event.preventDefault());
  win.on("closed", () => {
    docWindows.delete(win);
  });

  return win;
}

async function openDocumentFromDialog(win, focusNewWindow = false) {
  const options = {
    properties: ["openFile"],
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

  const docWin = createDocWindow(result.filePaths[0]);
  if (focusNewWindow && docWin) docWin.focus();
  return true;
}

async function saveDocumentAs(win) {
  // Implemented together with the file I/O feature.
  return false;
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

function helpHandlers() {
  return {
    clickedShowShortcuts: (item, win) => clickedShowShortcuts(win),
    clickedHelpVideos: (item, win) => clickedHelpVideos(win),
    clickedFAQ: (item, win) => clickedFAQ(win),
    clickedContactSupport: (item, win) => clickedContactSupport(win)
  };
}

/* ================= IPC ================= */

ipcMain.on("clicked-new", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  createDocWindow(null);
  if (win === homeWindow) destroyHome(win);
});

ipcMain.on("clicked-open", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  openDocumentFromDialog(win, true).then((opened) => {
    if (opened && win === homeWindow) destroyHome(win);
  });
});

ipcMain.on("clicked-document", (event, docPath) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  createDocWindow(docPath);
  if (win === homeWindow) destroyHome(win);
});

ipcMain.on("clicked-remove-document", (event, docPath) => {
  recentDocuments = recentDocuments.filter((rd) => rd.path !== docPath);
  applyMenu(
    getHomeMenuTemplate(homeMenuHandlers(), {
      isMac,
      recentDocuments,
      appName: app.getName()
    })
  );
});

ipcMain.on("copy-text", (event, text) => {
  clipboard.writeText(String(text ?? ""));
});

ipcMain.handle("read-clipboard", () => clipboard.readText());

ipcMain.on("copy-support-email", (event, isUrgent) => {
  const config = require("./config.js");
  clipboard.writeText(isUrgent ? config.SUPPORT_URGENT_EMAIL : config.SUPPORT_EMAIL);
});

ipcMain.on("close-window", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.on("maybe-close-window", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.destroy();
});

/* ================= App lifecycle ================= */

app.on("web-contents-created", (event, webContents) => {
  webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  webContents.on("will-navigate", (event, url) => {
    if (/^https?:/i.test(url) || /^mailto:/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
});

app.whenReady().then(() => {
  createHomeWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createHomeWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac) app.quit();
});

module.exports = { createDocWindow, createHomeWindow };
