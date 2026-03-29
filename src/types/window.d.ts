import type { NodexRendererApi } from "../shared/nodex-renderer-api";

declare global {
  interface Window {
    Nodex: NodexRendererApi;
  }
}

export {};
