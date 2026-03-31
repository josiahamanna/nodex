import type { NodexRendererApi } from "../shared/nodex-renderer-api";

declare global {
  interface Window {
    Nodex: NodexRendererApi;
    /** Set in plugin sandbox HTML; pdf.js worker URL (`nodex-pdf-worker:`). */
    __NODEX_PDFJS_WORKER_SRC__?: string;
  }
}

export {};
