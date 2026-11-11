"use strict";

const Elm = window.Elm;

Elm.Electron.ShortcutsModal.init({
  flags: { language: "en", isMac: window.electronAPI.platform === "darwin" }
});
