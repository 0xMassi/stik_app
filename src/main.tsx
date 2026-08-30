import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import ThemeProvider from "./themes/ThemeProvider";
import "./styles/globals.css";

globalThis.performance?.mark?.("stik:frontend-start");

const GlobalOverlays = lazy(() => import("./components/GlobalOverlays"));

// In production, block the context menu and devtools shortcuts.
//
// Registered through an AbortController so the listeners have a matching
// teardown; the root is never unmounted in practice, but leaving a global
// keydown handler with no cleanup path is the kind of thing that survives
// into a future refactor and leaks.
const hardening = new AbortController();

if (!import.meta.env.DEV) {
  document.addEventListener("contextmenu", (e) => e.preventDefault(), {
    signal: hardening.signal,
  });
  document.addEventListener(
    "keydown",
    (e) => {
      if (
        (e.metaKey && e.altKey && (e.key === "i" || e.key === "I")) ||
        (e.metaKey && e.shiftKey && (e.key === "i" || e.key === "I")) ||
        e.key === "F12"
      ) {
        e.preventDefault();
      }
    },
    { signal: hardening.signal },
  );
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => hardening.abort());
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <App />
        <Suspense fallback={null}>
          <GlobalOverlays />
        </Suspense>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
