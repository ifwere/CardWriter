// Document window shell (`Electron.view`).
//
// Layout, ids and class names match the Elm output: `#desktop-root` wraps the
// save indicator, `#document`, the breadcrumbs, the search field and the mobile
// buttons. Fullscreen replaces the columns; the export preview sits beside them.

import { useEffect, useState } from "react";

import { normalizeAndParse } from "../model/coders.ts";
import type { Tree } from "../model/tree.ts";
import { useDocument } from "../state/documentStore.ts";
import type { ExportFormat, ExportSelection } from "../model/export.ts";
import { Breadcrumbs } from "./Breadcrumbs.tsx";
import { ExportMenu, ExportPreview } from "./ExportMenu.tsx";
import { FullscreenEditor } from "./FullscreenEditor.tsx";
import { MobileButtons } from "./MobileButtons.tsx";
import { SaveIndicator } from "./SaveIndicator.tsx";
import { SearchField } from "./SearchField.tsx";
import { HistoryMenu } from "./HistoryMenu.tsx";
import { TreeView } from "./TreeView.tsx";
import { useScrollEffects } from "../dom/useScrollEffects.ts";

/** Converts a parsed document into the editor's single-root tree. */
export function documentTreeFromMarkdown(markdown: string | null): Tree {
  if (markdown === null) {
    return { id: "0", content: "", children: [{ id: "1", content: "", children: [] }] };
  }

  const parsed = normalizeAndParse(markdown);
  if (!parsed.ok) {
    // A parser error opens an empty document, exactly like `Electron.init`.
    return { id: "0", content: "", children: [{ id: "1", content: "", children: [] }] };
  }

  return { id: "0", content: "", children: parsed.trees };
}

export function EditorApp() {
  const ready = useDocument((state) => state.ready);
  const viewMode = useDocument((state) => state.viewMode);
  const historyOpen = useDocument((state) => state.historyOpen);
  const openHistory = useDocument((state) => state.openHistory);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState<ExportSelection>("everything");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("docx");

  useScrollEffects();

  // `clicked-export` from the File menu opens the preview.
  useEffect(() => {
    return window.electronAPI.clickedExport(() => {
      setExportSelection("everything");
      setExportFormat("docx");
      setExportOpen(true);
    });
  }, []);

  // Menu-driven edit commands route into the same store actions as the keys.
  useEffect(() => {
    const store = () => useDocument.getState();
    const offs = [
      window.electronAPI.clickedUndo(() => store().closeCard()),
      window.electronAPI.clickedCut(() => store().cut()),
      window.electronAPI.clickedCopy(() => store().copy()),
      window.electronAPI.clickedPaste(() => {
        void window.electronAPI.readClipboard().then((text) => {
          let payload: unknown = text;
          try {
            payload = JSON.parse(text);
          } catch {
            // Plain text.
          }
          store().paste(payload);
        });
      }),
      window.electronAPI.clickedPasteInto(() => {
        void window.electronAPI.readClipboard().then((text) => {
          let payload: unknown = text;
          try {
            payload = JSON.parse(text);
          } catch {
            // Plain text.
          }
          store().pasteInto(payload);
        });
      })
    ];
    return () => offs.forEach((off) => off());
  }, []);

  if (!ready) {
    return <div id="desktop-root" />;
  }

  return (
    <div id="desktop-root">
      <SaveIndicator />
      {historyOpen ? (
        <HistoryMenu />
      ) : (
        <div
          id="history-icon"
          title="Version History"
          onClick={openHistory}
          style={{ position: "fixed", top: 8, left: 10, cursor: "pointer", fill: "var(--normal-text-color)", zIndex: 5 }}
        >
          <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true">
            <path
              d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5 6.508 6.508 0 0 0-6.5-6.5zm.5 3v3l2.26 1.35a.5.5 0 1 1-.51.86L7.7 8.2a.5.5 0 0 1-.2-.4V4.5a.5.5 0 0 1 1 0z"
            />
          </svg>
        </div>
      )}

      {viewMode === "fullscreen" ? (
        <FullscreenEditor />
      ) : (
        <>
          <TreeView />
          <Breadcrumbs />
          <SearchField />
          <MobileButtons />
          <div id="loading-overlay" />
          <div id="preloader" />
        </>
      )}

      {exportOpen ? (
        <>
          <ExportMenu
            selection={exportSelection}
            format={exportFormat}
            onSelectionChange={setExportSelection}
            onFormatChange={setExportFormat}
            onClose={() => setExportOpen(false)}
          />
          <ExportPreview selection={exportSelection} format={exportFormat} />
        </>
      ) : null}
    </div>
  );
}
