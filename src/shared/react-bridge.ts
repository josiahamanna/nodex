import * as React from "react";
import * as ReactDOM from "react-dom";

/**
 * React Bridge API for Plugins
 *
 * This module provides a message-based React API that allows plugins
 * to use the main app's React instance without bundling their own.
 *
 * The bridge works by:
 * 1. Injecting React API into plugin iframes via window.Nodex.React
 * 2. Converting React API calls to postMessage communications
 * 3. Executing React operations in the main app context
 */

export interface ReactBridgeAPI {
  // Core React functions
  createElement: typeof React.createElement;
  useState: typeof React.useState;
  useEffect: typeof React.useEffect;
  useCallback: typeof React.useCallback;
  useMemo: typeof React.useMemo;
  useRef: typeof React.useRef;
  useContext: typeof React.useContext;
  useReducer: typeof React.useReducer;

  // React DOM
  render: (element: React.ReactElement, container: Element) => void;

  // Fragment
  Fragment: typeof React.Fragment;
}

/**
 * Generates the React bridge code to be injected into plugin iframes
 */
export function generateReactBridge(): string {
  return `
    // React Bridge API for Plugins
    (function() {
      'use strict';
      
      // Get React from parent window
      const parentReact = window.parent.React;
      const parentReactDOM = window.parent.ReactDOM;
      
      if (!parentReact || !parentReactDOM) {
        console.error('[React Bridge] React or ReactDOM not found in parent window');
        return;
      }
      
      // Create Nodex namespace if it doesn't exist
      if (!window.Nodex) {
        window.Nodex = {};
      }
      
      // Expose React API
      window.Nodex.React = {
        // Core React
        createElement: parentReact.createElement.bind(parentReact),
        useState: parentReact.useState.bind(parentReact),
        useEffect: parentReact.useEffect.bind(parentReact),
        useCallback: parentReact.useCallback.bind(parentReact),
        useMemo: parentReact.useMemo.bind(parentReact),
        useRef: parentReact.useRef.bind(parentReact),
        useContext: parentReact.useContext.bind(parentReact),
        useReducer: parentReact.useReducer.bind(parentReact),
        Fragment: parentReact.Fragment,
        
        // Additional hooks
        useLayoutEffect: parentReact.useLayoutEffect?.bind(parentReact),
        useImperativeHandle: parentReact.useImperativeHandle?.bind(parentReact),
        useDebugValue: parentReact.useDebugValue?.bind(parentReact),
        useDeferredValue: parentReact.useDeferredValue?.bind(parentReact),
        useTransition: parentReact.useTransition?.bind(parentReact),
        useId: parentReact.useId?.bind(parentReact),
        
        // Component types
        Component: parentReact.Component,
        PureComponent: parentReact.PureComponent,
        memo: parentReact.memo?.bind(parentReact),
        
        // Context
        createContext: parentReact.createContext?.bind(parentReact),
        
        // Refs
        createRef: parentReact.createRef?.bind(parentReact),
        forwardRef: parentReact.forwardRef?.bind(parentReact),
        
        // Lazy loading
        lazy: parentReact.lazy?.bind(parentReact),
        Suspense: parentReact.Suspense,
        
        // Error boundaries
        isValidElement: parentReact.isValidElement?.bind(parentReact),
        Children: parentReact.Children,
      };
      
      // Expose ReactDOM API
      window.Nodex.ReactDOM = {
        render: parentReactDOM.render?.bind(parentReactDOM),
        createRoot: parentReactDOM.createRoot?.bind(parentReactDOM),
        hydrateRoot: parentReactDOM.hydrateRoot?.bind(parentReactDOM),
        unmountComponentAtNode: parentReactDOM.unmountComponentAtNode?.bind(parentReactDOM),
        findDOMNode: parentReactDOM.findDOMNode?.bind(parentReactDOM),
        createPortal: parentReactDOM.createPortal?.bind(parentReactDOM),
        flushSync: parentReactDOM.flushSync?.bind(parentReactDOM),
      };
      
      // Convenience aliases
      window.React = window.Nodex.React;
      window.ReactDOM = window.Nodex.ReactDOM;
      
      console.log('[React Bridge] React API injected successfully');
    })();
  `;
}

/**
 * TypeScript definitions for the React Bridge API
 */
export const reactBridgeTypes = `
declare global {
  interface Window {
    Nodex: {
      React: {
        createElement: typeof React.createElement;
        useState: typeof React.useState;
        useEffect: typeof React.useEffect;
        useCallback: typeof React.useCallback;
        useMemo: typeof React.useMemo;
        useRef: typeof React.useRef;
        useContext: typeof React.useContext;
        useReducer: typeof React.useReducer;
        useLayoutEffect: typeof React.useLayoutEffect;
        useImperativeHandle: typeof React.useImperativeHandle;
        useDebugValue: typeof React.useDebugValue;
        useDeferredValue: typeof React.useDeferredValue;
        useTransition: typeof React.useTransition;
        useId: typeof React.useId;
        Fragment: typeof React.Fragment;
        Component: typeof React.Component;
        PureComponent: typeof React.PureComponent;
        memo: typeof React.memo;
        createContext: typeof React.createContext;
        createRef: typeof React.createRef;
        forwardRef: typeof React.forwardRef;
        lazy: typeof React.lazy;
        Suspense: typeof React.Suspense;
        isValidElement: typeof React.isValidElement;
        Children: typeof React.Children;
      };
      ReactDOM: {
        render: typeof ReactDOM.render;
        createRoot: typeof ReactDOM.createRoot;
        hydrateRoot: typeof ReactDOM.hydrateRoot;
        unmountComponentAtNode: typeof ReactDOM.unmountComponentAtNode;
        findDOMNode: typeof ReactDOM.findDOMNode;
        createPortal: typeof ReactDOM.createPortal;
        flushSync: typeof ReactDOM.flushSync;
      };
    };
    React: typeof Nodex.React;
    ReactDOM: typeof Nodex.ReactDOM;
  }
}

export {};
`;
