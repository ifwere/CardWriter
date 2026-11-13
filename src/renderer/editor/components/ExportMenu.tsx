// Export menu and preview (`Doc.UI.viewExportMenu` + `Page.Doc.Export`).
//
// The preview shows the exact string that will be written; the download button
// hands `[extension, content]` to the main process.

import { useMemo } from "react";

import {
  exportToString,
  toExtension,
  type ExportFormat,
  type ExportSelection
} from "../model/export.ts";
import type { Tree } from "../model/tree.ts";
import { useDocument } from "../state/documentStore.ts";
import { CloseCircleOutlined, DownloadOutlined, PrinterOutlined } from "./icons.tsx";
import { t } from "../../shared/i18n.ts";

const SELECTIONS: { value: ExportSelection; label: string; description: string }[] = [
  { value: "everything", label: "Elm:ExportSettingEverything", description: "Elm:ExportSettingEverythingDesc" },
  { value: "subtree", label: "Elm:ExportSettingCurrentSubtree", description: "Elm:ExportSettingCurrentSubtreeDesc" },
  { value: "leaves", label: "Elm:ExportSettingLeavesOnly", description: "Elm:ExportSettingLeavesOnlyDesc" },
  { value: "column", label: "Elm:ExportSettingCurrentColumn", description: "Elm:ExportSettingCurrentColumnDesc" }
];

const FORMATS: { value: ExportFormat; label: string; description: string }[] = [
  { value: "docx", label: "Elm:ExportSettingWord", description: "Elm:DownloadWordFile" },
  { value: "text", label: "Elm:ExportSettingPlainText", description: "Elm:DownloadTextFile" },
  { value: "opml", label: "Elm:ExportSettingOPML", description: "Elm:DownloadOPMLFile" },
  { value: "json", label: "Elm:ExportSettingJSON", description: "Elm:DownloadJSONFile" }
];

function findCard(tree: Tree, id: string): Tree | undefined {
  if (tree.id === id) return tree;
  for (const child of tree.children) {
    const found = findCard(child, id);
    if (found) return found;
  }
  return undefined;
}

/** File name without extension, used for OPML titles and JSON export. */
function documentName(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? "Untitled";
  return base.replace(/\.(gkw|gko|md)$/i, "");
}

export interface ExportMenuProps {
  selection: ExportSelection;
  format: ExportFormat;
  onSelectionChange(selection: ExportSelection): void;
  onFormatChange(format: ExportFormat): void;
  onClose(): void;
}

export function ExportMenu({
  selection,
  format,
  onSelectionChange,
  onFormatChange,
  onClose
}: ExportMenuProps) {
  const language = useDocument((state) => state.language);

  return (
    <div id="export-menu">
      <div id="export-selection" className="toggle-button">
        {SELECTIONS.map((option) => (
          <div
            key={option.value}
            id={`export-select-${option.value}`}
            className={selection === option.value ? "selected" : undefined}
            title={t(language, option.description)}
            onClick={() => onSelectionChange(option.value)}
          >
            {t(language, option.label)}
          </div>
        ))}
      </div>
      <div id="export-format" className="toggle-button">
        {FORMATS.map((option) => (
          <div
            key={option.value}
            id={`export-format-${option.value}`}
            className={format === option.value ? "selected" : undefined}
            onClick={() => onFormatChange(option.value)}
          >
            {t(language, option.label)}
          </div>
        ))}
      </div>
      <span id="export-button-close" title={t(language, "Elm:CloseExportView")} onClick={onClose}>
        <CloseCircleOutlined width={16} />
      </span>
    </div>
  );
}

export function ExportPreview({
  selection,
  format
}: {
  selection: ExportSelection;
  format: ExportFormat;
}) {
  const tree = useDocument((state) => state.tree);
  const active = useDocument((state) => state.active);
  const filePath = useDocument((state) => state.filePath);
  const language = useDocument((state) => state.language);

  const activeTree = findCard(tree, active) ?? tree;
  const docName = documentName(filePath);
  const content = useMemo(
    () => exportToString(docName, selection, format, activeTree, tree),
    [docName, selection, format, activeTree, tree]
  );

  const download = () => {
    window.electronAPI.exportFile([toExtension(format), content]);
  };

  return (
    <div id="export-preview">
      <div className="plain" data-private="lipsum">
        {content}
      </div>
      <div id="export-action-buttons">
        <div id="export-download" title={t(language, "Elm:DownloadWordFile")} onClick={download}>
          <DownloadOutlined />
        </div>
        <div id="export-print" title={t(language, "Elm:PrintThis")} onClick={() => window.print()}>
          <PrinterOutlined />
        </div>
      </div>
    </div>
  );
}
