// Document window entry point.
//
// Subscribes to the main-process events that used to feed the Elm app
// (`file-received`, `file-saved`, `commit-data-result`), installs the keyboard
// bindings and mounts the React shell.

import { createRoot } from "react-dom/client";

import { EditorApp, documentTreeFromMarkdown } from "./components/EditorApp.tsx";
import { installKeyboard } from "./keyboard.ts";
import { useDocument, type FileReceivedPayload } from "./state/documentStore.ts";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Document window is missing #root");
}

const root = createRoot(rootElement);
root.render(<EditorApp />);

installKeyboard();

const language = () => navigator.language || "en";

window.electronAPI.fileReceived((_event, payload) => {
  const data = payload as unknown as FileReceivedPayload & { language?: string };
  const tree = documentTreeFromMarkdown(data.fileData);
  useDocument
    .getState()
    .init(data, tree, data.language ?? language(), window.electronAPI.platform === "darwin");
});

window.electronAPI.fileSaved((_event, data) => {
  const [path, savedAt, isUntitled] = data;
  useDocument.getState().markFileSaved(path, savedAt, isUntitled);
});

window.electronAPI.commitDataResult((_event, data) => {
  useDocument.getState().mergeCommitResult(data);
});

// The save indicator shows "3 minutes ago", so the clock has to advance even
// when nothing else changes (the Elm app ticked every 9 s).
window.setInterval(() => useDocument.getState().tick(Date.now()), 9000);

// Unsaved untitled documents and dirty saved documents get a prompt before the
// window closes, matching `window.onbeforeunload` in the legacy renderer.
window.onbeforeunload = (event) => {
  const state = useDocument.getState();
  if (state.isUntitled) {
    window.electronAPI.maybeCloseWindow();
    event.returnValue = false;
    return false;
  }
  if (state.dirty) {
    window.electronAPI.flushAndClose();
    event.returnValue = false;
    return false;
  }
  return undefined;
};
