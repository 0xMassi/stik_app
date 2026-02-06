import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// In production, block context menu and devtools shortcuts
if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault());
  document.addEventListener("keydown", (e) => {
    if (
      (e.metaKey && e.altKey && (e.key === "i" || e.key === "I")) ||
      (e.metaKey && e.shiftKey && (e.key === "i" || e.key === "I")) ||
      e.key === "F12"
    ) {
      e.preventDefault();
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
