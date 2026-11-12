// Typed surface of the preload bridge.
//
// Keep this in sync with src/electron/preload.js and the ipcMain channels in
// src/electron/main.js. Payloads that still belong to the legacy renderer are
// typed as `unknown` until their phase of the migration lands.

export interface RecentDocument {
  name: string;
  path: string;
  birthtimeMs: number;
  atimeMs: number;
  mtimeMs: number;
}

export interface HomeData {
  recentDocuments: RecentDocument[];
  language: string;
  currentTime: number;
}

export interface ElectronAPI {
  readonly platform: string;

  /* Home window */
  clickedNew(): void;
  clickedOpen(): void;
  clickedImport(): void;
  clickedDocument(path: string): void;
  clickedRemoveDocument(path: string): void;

  /* Document window */
  localStoreSet(key: string, value: unknown): void;
  exportFile(data: unknown): void;
  saveFile(data: unknown): void;
  commitData(data: unknown): void;
  maybeCloseWindow(): void;
  flushAndClose(): void;
  closeWindow(): void;

  /* Events */
  fileReceived(callback: (event: unknown, data: HomeData) => void): () => void;
  fileSaved(callback: (event: unknown, data: [string, number, boolean]) => void): () => void;
  commitDataResult(
    callback: (event: unknown, data: Record<string, unknown[]>) => void
  ): () => void;
  clickedExport(callback: (event: unknown) => void): () => void;
  clickedUndo(callback: (event: unknown) => void): () => void;
  clickedCut(callback: (event: unknown) => void): () => void;
  clickedCopy(callback: (event: unknown) => void): () => void;
  clickedPaste(callback: (event: unknown) => void): () => void;
  clickedPasteInto(callback: (event: unknown) => void): () => void;

  /* Clipboard and links */
  copyText(text: string): void;
  readClipboard(): Promise<string>;
  copySupportEmail(isUrgent: boolean): void;
  openExternal(url: string): void;

  /* Escape hatch used by a couple of Elm interop helpers */
  toMain(channel: string, ...args: unknown[]): void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
