import { createRoot } from "react-dom/client";

import { VideosApp } from "./VideosApp";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Videos window is missing #root");

createRoot(rootElement).render(<VideosApp />);
