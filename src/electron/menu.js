"use strict";

function safe(handler) {
  return (item, focusedWindow) => {
    if (typeof handler === "function") handler(item, focusedWindow);
  };
}

/**
 * File menu shared by the Home and document windows.
 */
function fileMenu(handlers, { isMac, isHome, isUntitled, recentDocuments }) {
  const items = [
    { label: "New Document", accelerator: "CmdOrCtrl+N", click: safe(handlers.clickedNew) },
    { label: "Open…", accelerator: "CmdOrCtrl+O", click: safe(handlers.clickedOpen) }
  ];

  if (isMac) {
    items.push({
      label: "Open Recent",
      role: "recentdocuments",
      submenu: [{ label: "Clear Menu", role: "clearrecentdocuments" }]
    });
  } else {
    items.push({
      label: "Open Recent",
      submenu: (recentDocuments || []).length
        ? (recentDocuments || [])
            .slice()
            .reverse()
            .slice(0, 20)
            .map((docPath, idx) => ({
              label: `${idx + 1}. ${docPath.split(/[\\/]/).pop() || docPath}`,
              click: safe(() => handlers.clickedRecentDoc?.(null, null, docPath))
            }))
        : [{ label: "No Recent Documents", enabled: false }]
    });
  }

  if (!isHome) {
    items.push({ type: "separator" });
    items.push({
      label: "Save",
      accelerator: "CmdOrCtrl+S",
      click: safe(handlers.clickedSave)
    });
    items.push({
      label: "Save As…",
      accelerator: "CmdOrCtrl+Shift+S",
      click: safe(handlers.clickedSaveAs)
    });
    items.push({ type: "separator" });
    items.push({ label: "Export…", click: safe(handlers.clickedExport) });
    items.push({ type: "separator" });
    items.push({ label: "Close Window", accelerator: "CmdOrCtrl+W", click: safe(handlers.clickedClose) });
  }

  if (!isMac) {
    items.push({ type: "separator" });
    items.push({ label: "Exit", role: "quit", click: safe(handlers.clickedExit) });
  }

  return { label: "File", submenu: items };
}

function editMenu(handlers, isEditMode) {
  if (isEditMode) {
    return {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    };
  }

  return {
    label: "Edit",
    submenu: [
      {
        label: "Undo / Redo (Version History)",
        accelerator: "CmdOrCtrl+Z",
        // The page's keyboard handler decides between native editing and
        // subtree operations, so the menu must not steal the keystroke.
        registerAccelerator: false,
        click: safe(handlers.clickedUndo)
      },
      { type: "separator" },
      {
        label: "Cut current subtree",
        accelerator: "CmdOrCtrl+X",
        registerAccelerator: false,
        click: safe(handlers.clickedCut)
      },
      {
        label: "Copy current subtree",
        accelerator: "CmdOrCtrl+C",
        registerAccelerator: false,
        click: safe(handlers.clickedCopy)
      },
      {
        label: "Paste subtree below current card",
        accelerator: "CmdOrCtrl+V",
        registerAccelerator: false,
        click: safe(handlers.clickedPaste)
      },
      {
        label: "Paste subtree as child of current card",
        accelerator: "CmdOrCtrl+Shift+V",
        registerAccelerator: false,
        click: safe(handlers.clickedPasteInto)
      }
    ]
  };
}

function helpMenu(handlers) {
  return {
    label: "Help",
    role: "help",
    submenu: [
      { label: "Keyboard Shortcuts", click: safe(handlers.clickedShowShortcuts) },
      { label: "Help Videos", click: safe(handlers.clickedHelpVideos) },
      { label: "FAQ & Documentation", click: safe(handlers.clickedFAQ) },
      { label: "Contact Support", click: safe(handlers.clickedContactSupport) }
    ]
  };
}

function appMenu(appName) {
  return {
    label: appName,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services", submenu: [] },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" }
    ]
  };
}

/**
 * @param {Record<string, Function>} handlers
 * @param {{ isMac: boolean, recentDocuments: string[], appName: string }} options
 */
function getHomeMenuTemplate(handlers, { isMac, recentDocuments, appName }) {
  const template = [
    fileMenu(handlers, { isMac, isHome: true, recentDocuments }),
    helpMenu(handlers)
  ];
  if (isMac) template.unshift(appMenu(appName));
  return template;
}

/**
 * @param {Record<string, Function>} handlers
 * @param {{ isMac: boolean, isUntitled: boolean, recentDocuments: string[], appName: string, isEditMode: boolean }} options
 */
function getDocMenuTemplate(handlers, { isMac, isUntitled, recentDocuments, appName, isEditMode }) {
  const template = [
    fileMenu(handlers, { isMac, isHome: false, isUntitled, recentDocuments }),
    editMenu(handlers, isEditMode),
    helpMenu(handlers)
  ];
  if (isMac) template.unshift(appMenu(appName));
  return template;
}

module.exports = {
  getHomeMenuTemplate,
  getDocMenuTemplate
};
