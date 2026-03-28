import * as React from "react";
import * as ReactDOM from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";

/**
 * React bridge for plugin iframes (Epic 1.3).
 * The parent attaches the real React/ReactDOM objects after a short postMessage
 * handshake so plugin code never reads `window.parent` (CSP / isolation friendly).
 */
export function attachReactToPluginWindow(w: Window): void {
  const target = w as Window & {
    Nodex?: Record<string, unknown>;
    React?: unknown;
    ReactDOM?: unknown;
  };

  target.Nodex = target.Nodex ?? {};
  const R = React;
  const RD = ReactDOM;

  target.Nodex.React = {
    createElement: R.createElement.bind(R),
    useState: R.useState.bind(R),
    useEffect: R.useEffect.bind(R),
    useCallback: R.useCallback.bind(R),
    useMemo: R.useMemo.bind(R),
    useRef: R.useRef.bind(R),
    useContext: R.useContext.bind(R),
    useReducer: R.useReducer.bind(R),
    useLayoutEffect: R.useLayoutEffect?.bind(R),
    useImperativeHandle: R.useImperativeHandle?.bind(R),
    useDebugValue: R.useDebugValue?.bind(R),
    useDeferredValue: R.useDeferredValue?.bind(R),
    useTransition: R.useTransition?.bind(R),
    useId: R.useId?.bind(R),
    Fragment: R.Fragment,
    Component: R.Component,
    PureComponent: R.PureComponent,
    memo: R.memo?.bind(R),
    createContext: R.createContext?.bind(R),
    createRef: R.createRef?.bind(R),
    forwardRef: R.forwardRef?.bind(R),
    lazy: R.lazy?.bind(R),
    Suspense: R.Suspense,
    isValidElement: R.isValidElement?.bind(R),
    Children: R.Children,
  };

  const rd = RD as Record<string, unknown>;

  target.Nodex.ReactDOM = {
    render:
      typeof rd.render === "function"
        ? (rd.render as (...a: unknown[]) => unknown).bind(RD)
        : undefined,
    createRoot,
    hydrateRoot,
    unmountComponentAtNode:
      typeof rd.unmountComponentAtNode === "function"
        ? (rd.unmountComponentAtNode as (...a: unknown[]) => unknown).bind(RD)
        : undefined,
    findDOMNode:
      typeof rd.findDOMNode === "function"
        ? (rd.findDOMNode as (...a: unknown[]) => unknown).bind(RD)
        : undefined,
    createPortal: RD.createPortal?.bind(RD),
    flushSync: RD.flushSync?.bind(RD),
  };

  target.React = target.Nodex.React;
  target.ReactDOM = target.Nodex.ReactDOM;
}

/** @deprecated Inline bootstrap in SecurePluginRenderer uses postMessage + attachReactToPluginWindow. */
export function generateReactBridge(): string {
  return "/* deprecated: use attachReactToPluginWindow from parent */";
}

export const reactBridgeTypes = `
declare global {
  interface Window {
    Nodex: {
      React: Record<string, unknown>;
      ReactDOM: Record<string, unknown>;
    };
    React: typeof Nodex.React;
    ReactDOM: typeof Nodex.ReactDOM;
  }
}
export {};
`;
