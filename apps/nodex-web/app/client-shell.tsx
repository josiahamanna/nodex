"use client";

import React from "react";
import * as ReactDOM from "react-dom";
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import { Provider } from "react-redux";
import { NodexContributionProvider } from "../../../src/renderer/shell/NodexContributionContext";
import { ShellLayoutProvider } from "../../../src/renderer/shell/layout/ShellLayoutContext";
import { ShellViewProvider } from "../../../src/renderer/shell/views/ShellViewContext";
import { ShellRegistriesProvider } from "../../../src/renderer/shell/registries/ShellRegistriesContext";
import { NodexDialogProvider } from "../../../src/renderer/dialog/NodexDialogProvider";
import { ThemeProvider } from "../../../src/renderer/theme/ThemeContext";
import { ToastProvider } from "../../../src/renderer/toast/ToastContext";
import {
  initHeadlessWebApiBaseFromUrlAndStorage,
  installNodexWebShimIfNeeded,
} from "../../../src/renderer/nodex-web-shim";
import { store } from "../../../src/renderer/store";

function runClientBootstrap(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    initHeadlessWebApiBaseFromUrlAndStorage();
  } catch {
    /* ignore */
  }
  installNodexWebShimIfNeeded();
  loader.config({ monaco });
  (window as unknown as { React?: typeof React }).React = React;
  (window as unknown as { ReactDOM?: typeof ReactDOM }).ReactDOM = ReactDOM;
  if (process.env.NODE_ENV !== "production") {
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
}

runClientBootstrap();

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <NodexDialogProvider>
          <Provider store={store}>
            <ShellLayoutProvider>
              <ShellViewProvider>
                <ShellRegistriesProvider>
                  <NodexContributionProvider>{children}</NodexContributionProvider>
                </ShellRegistriesProvider>
              </ShellViewProvider>
            </ShellLayoutProvider>
          </Provider>
        </NodexDialogProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
