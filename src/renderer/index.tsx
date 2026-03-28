import React from "react";
import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Provider } from "react-redux";
import { store } from "./store";
import App from "./App";
import "./styles.css";

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
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
