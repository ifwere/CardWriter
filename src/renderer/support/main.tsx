import { createRoot } from "react-dom/client";

import { SupportApp } from "./SupportApp";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Support window is missing #root");

createRoot(rootElement).render(<SupportApp language="en" />);
