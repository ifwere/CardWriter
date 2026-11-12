import { createRoot } from "react-dom/client";

import { ShortcutsApp } from "./ShortcutsApp";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Shortcuts window is missing #root");

createRoot(rootElement).render(
  <ShortcutsApp language="en" isMac={window.electronAPI.platform === "darwin"} />
);
