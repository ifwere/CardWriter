"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/** Subscribe to a main-process channel, stripping the IpcRendererEvent. */
function on(channel, callback) {
  const listener = (event, ...args) => callback(event, ...args);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  /* Home window */
  clickedNew: () => ipcRenderer.send("clicked-new"),
  clickedOpen: () => ipcRenderer.send("clicked-open"),
  clickedImport: () => ipcRenderer.send("clicked-import"),
  clickedDocument: (docPath) => ipcRenderer.send("clicked-document", docPath),
  clickedRemoveDocument: (docPath) => ipcRenderer.send("clicked-remove-document", docPath),

  /* Document window */
  localStoreSet: (key, value) => ipcRenderer.send("local-store-set", key, value),
  exportFile: (data) => ipcRenderer.send("export-file", data),
  saveFile: (data) => ipcRenderer.send("save-file", data),
  commitData: (commitData) => ipcRenderer.send("commit-data", commitData),
  maybeCloseWindow: () => ipcRenderer.send("maybe-close-window"),
  closeWindow: () => ipcRenderer.send("close-window"),

  /* Events */
  fileReceived: (callback) => on("file-received", callback),
  fileSaved: (callback) => on("file-saved", callback),
  commitDataResult: (callback) => on("commit-data-result", callback),
  clickedExport: (callback) => on("clicked-export", callback),
  clickedUndo: (callback) => on("clicked-undo", callback),
  clickedCut: (callback) => on("clicked-cut", callback),
  clickedCopy: (callback) => on("clicked-copy", callback),
  clickedPaste: (callback) => on("clicked-paste", callback),
  clickedPasteInto: (callback) => on("clicked-paste-into", callback),

  /* Clipboard (file:// pages cannot rely on navigator.clipboard) */
  copyText: (text) => ipcRenderer.send("copy-text", text),
  readClipboard: () => ipcRenderer.invoke("read-clipboard"),
  copySupportEmail: (isUrgent) => ipcRenderer.send("copy-support-email", isUrgent),

  /* Generic escape hatch used by a couple of Elm interop helpers */
  toMain: (channel, ...args) => ipcRenderer.send(channel, ...args)
});
