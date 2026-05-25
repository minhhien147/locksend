import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

function finishPreloader() {
  const w = window as Window & { locksendFinishPreloader?: () => void };
  if (typeof w.locksendFinishPreloader !== "function") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      w.locksendFinishPreloader!();
    });
  });
}

finishPreloader();
