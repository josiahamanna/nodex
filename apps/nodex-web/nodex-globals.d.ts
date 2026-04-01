import type { NodexRendererApi } from "../../src/shared/nodex-renderer-api";

export {};

declare global {
  interface Window {
    Nodex: NodexRendererApi;
    __NODEX_WEB_API_BASE__?: string;
  }
}

