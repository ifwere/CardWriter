"use strict";

const Elm = window.Elm;

const supportModal = Elm.Electron.SupportModal.init();

supportModal.ports.copyEmail.subscribe((isUrgent) => {
  window.electronAPI.copySupportEmail(isUrgent);
});
