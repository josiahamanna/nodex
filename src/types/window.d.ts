import type { NodexRendererApi } from "../shared/nodex-renderer-api";

declare global {
  interface Window {
    Nodex: NodexRendererApi;
    /** Set in plugin sandbox HTML; pdf.js worker URL (`nodex-pdf-worker:`). */
    __NODEX_PDFJS_WORKER_SRC__?: string;
    /** Base URL of the headless HTTP API (no trailing slash); from query, localStorage, or the web API bar. */
    __NODEX_WEB_API_BASE__?: string;
  }
}

export {};
