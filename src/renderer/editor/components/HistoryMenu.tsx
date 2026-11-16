// Version-history browser (`Doc.UI.viewHistory`).
//
// Overlays the document with a slider over the saved commits. Dragging the
// slider previews a commit; Restore replaces the working tree with it and
// closes the menu. The slider runs oldest→newest, ending at `historyStart`
// (the last known `heads/master`).

import { useMemo } from "react";

import { historyList } from "../model/history.ts";
import { useDocument } from "../state/documentStore.ts";
import { formatDateTime, t } from "../../shared/i18n.ts";
import { CloseCircleOutlined } from "./icons.tsx";

export function HistoryMenu() {
  const language = useDocument((state) => state.language);
  const history = useDocument((state) => state.history);
  const historyStart = useDocument((state) => state.historyStart);
  const historyCurrent = useDocument((state) => state.historyCurrent);
  const previewHistory = useDocument((state) => state.previewHistory);
  const restoreHistory = useDocument((state) => state.restoreHistory);
  const closeHistory = useDocument((state) => state.closeHistory);

  const list = useMemo(
    () => (historyStart ? historyList(historyStart, history) : []),
    [historyStart, history]
  );

  // The slider is 0..N over the sorted commit list; the selected index maps
  // back to the span's sha. Track the current selection by timestamp.
  const currentIndex =
    historyCurrent === ""
      ? list.length - 1
      : list.findIndex((entry) => entry.sha === historyCurrent);

  const currentEntry = list[currentIndex];

  return (
    <div id="history-menu">
      <input
        id="history-slider"
        type="range"
        min={0}
        max={Math.max(0, list.length - 1)}
        step={1}
        value={Math.max(0, currentIndex)}
        onChange={(event) => {
          const idx = Number(event.target.value);
          const entry = list[idx];
          if (entry) previewHistory(entry.sha);
        }}
      />
      {currentEntry ? (
        <div id="history-time-info">
          {formatDateTime(language, currentEntry.commit.timestamp)}
        </div>
      ) : (
        <div id="history-time-info" />
      )}
      <button id="history-restore" onClick={restoreHistory} disabled={list.length === 0}>
        {t(language, "Elm:RestoreThisVersion")}
      </button>
      <div id="history-close-button" onClick={closeHistory}>
        <CloseCircleOutlined width={16} />
      </div>
    </div>
  );
}