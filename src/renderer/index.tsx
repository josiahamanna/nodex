import React from "react";
import { createRoot } from "react-dom/client";
import * as ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { store } from "./store";
import App from "./App";
import "./styles.css";
import * as TiptapReact from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

// Expose libraries to window for plugin access
(window as any).React = React;
(window as any).ReactDOM = ReactDOM;
(window as any).TiptapReact = TiptapReact;
(window as any).TiptapStarterKit = { StarterKit };

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
