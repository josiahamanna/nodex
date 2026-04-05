import type { NodexDevtoolsShellApi } from "../renderer/shell/devtoolsShellExpose";
import type { NodexRendererApi } from "../shared/nodex-renderer-api";

/** `window.nodex.shell` / `window.nodex.devtools` (devtools is an alias when the shell API is mounted). */
type NodexWindowGlobal = {
  shell?: NodexDevtoolsShellApi;
  devtools?: NodexDevtoolsShellApi;
};

declare global {
  interface Window {
    Nodex: NodexRendererApi;
    /**
     * Host-injected namespace (shell devtools API, notebook helpers, etc.).
     * Intersection with `Record` allows extra keys without widening `shell`/`devtools` to `unknown`.
     */
    nodex?: NodexWindowGlobal & Record<string, unknown>;
    /** Set in plugin sandbox HTML; pdf.js worker URL (`nodex-pdf-worker:`). */
    __NODEX_PDFJS_WORKER_SRC__?: string;
    /** Base URL of the headless HTTP API (no trailing slash); from query, localStorage, or the web API bar. */
    __NODEX_WEB_API_BASE__?: string;
  }
}

export {};
