// "All Changes Saved" / "Unsaved changes..." in the window corner.
//
// Port of `Electron.viewFileSaveIndicator`. The label text stays English (the
// Elm view hard-coded it too); only the tooltip is localized, because it shows
// the last-save time in words.

import { useDocument } from "../state/documentStore.ts";
import { formatRelative } from "../../shared/i18n.ts";

export function SaveIndicator() {
  const dirty = useDocument((state) => state.dirty);
  const viewMode = useDocument((state) => state.viewMode);
  const lastSave = useDocument((state) => state.lastSave);
  const currentTime = useDocument((state) => state.currentTime);
  const language = useDocument((state) => state.language);

  let lastSaveInWords = "Just now";
  if (lastSave !== null) {
    lastSaveInWords =
      Math.abs(currentTime - lastSave) < 3000
        ? "Just now"
        : formatRelative(language, lastSave, currentTime);
  }

  return (
    <div
      id="file-save-indicator"
      className={`${dirty ? "dirty" : ""}${viewMode === "fullscreen" ? " fullscreen" : ""}`}
      title={lastSaveInWords}
    >
      {dirty ? "Unsaved changes..." : "All Changes Saved"}
    </div>
  );
}
