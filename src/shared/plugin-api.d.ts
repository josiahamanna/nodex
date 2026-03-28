/**
 * Nodex plugin runtime (iframe). Injected by SecurePluginRenderer before plugin code runs.
 * Epic 1.3 — use host React via bridge globals (not a separate React copy).
 */
export {};

declare global {
  interface Window {
    __NODEX_NOTE__?: {
      id?: string;
      type?: string;
      title?: string;
      content: string;
      metadata?: Record<string, unknown>;
    };

    Nodex: {
      React: typeof import("react");
      ReactDOM: typeof import("react-dom") & {
        createRoot?: (container: Element | DocumentFragment) => {
          render: (node: import("react").ReactNode) => void;
        };
      };
      postMessage: (data: unknown) => void;
      /** Persist JSON-serializable UI state (debounced on host). */
      postPluginUiState?: (state: unknown) => void;
      onMessage: ((message: unknown) => void) | null;
    };
  }
}
