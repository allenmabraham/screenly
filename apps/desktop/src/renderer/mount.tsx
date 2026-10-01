import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export function mount(node: ReactNode) {
  const root = document.getElementById("root");
  if (!root) {
    throw new Error("Missing #root element.");
  }
  createRoot(root).render(<StrictMode>{node}</StrictMode>);
}
