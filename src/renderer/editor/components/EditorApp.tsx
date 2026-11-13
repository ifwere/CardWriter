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
import { TreeView } from "./TreeView.tsx";

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

  const [exportOpen, setExportOpen] = useState(false);
  const [exportSelection, setExportSelection] = useState<ExportSelection>("everything");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("docx");

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
