import { createRoot } from "react-dom/client";

import { HomeApp } from "./HomeApp";
import type { HomeData } from "../shared/api";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Home window is missing #root");
}

const root = createRoot(rootElement);

window.electronAPI.fileReceived((_event, data: HomeData) => {
  root.render(<HomeApp data={data} />);
});
