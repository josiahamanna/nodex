import React from "react";
import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Provider } from "react-redux";
import { store } from "./store";
import { installNodexWebShimIfNeeded } from "./nodex-web-shim";
import App from "./App";

installNodexWebShimIfNeeded();
import { NodexContributionProvider } from "./shell/NodexContributionContext";
import { NodexDialogProvider } from "./dialog/NodexDialogProvider";
import { ThemeProvider } from "./theme/ThemeContext";
import { ToastProvider } from "./toast/ToastContext";
import "./styles.css";

// Chromium sometimes emits "ResizeObserver loop completed with undelivered notifications."
// as an uncaught error during layout thrash; webpack-dev-server then shows a full-screen red
// overlay, which is noisy and blocks dev workflows. Suppress ONLY this known-benign message.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  const RO_LOOP_RE = /ResizeObserver loop (completed|limit exceeded)/i;
  window.addEventListener(
    "error",
    (e) => {
      const msg = (e as ErrorEvent).message || "";
      if (RO_LOOP_RE.test(msg)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

/** Ship Monaco inside the app bundle (see monaco-editor-webpack-plugin in webpack.renderer.config.js). */
loader.config({ monaco });
// Expose libraries to window for plugin access
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <NodexDialogProvider>
          <Provider store={store}>
            <NodexContributionProvider>
              <App />
            </NodexContributionProvider>
          </Provider>
        </NodexDialogProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
