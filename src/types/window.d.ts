import type { NodexDevtoolsShellApi } from "../renderer/shell/devtoolsShellExpose";
import type { NodexRendererApi } from "../shared/nodex-renderer-api";

/** `window.nodex.shell` / `window.nodex.devtools` (devtools is an alias when the shell API is mounted). */
type NodexWindowGlobal = {
  shell?: NodexDevtoolsShellApi;
  devtools?: NodexDevtoolsShellApi;
};

/** Preload `contextBridge` API for `@nodex/platform` DesktopHost (sync nudge from main). */
type NodexDesktopBridge = {
  onSyncTrigger: (callback: () => void) => () => void;
};

declare global {
  interface Window {
    Nodex: NodexRendererApi;
    nodexDesktop?: NodexDesktopBridge;
    /**
     * Host-injected namespace (shell devtools API, notebook helpers, etc.).
     * Intersection with `Record` allows extra keys without widening `shell`/`devtools` to `unknown`.
     */
    nodex?: NodexWindowGlobal & Record<string, unknown>;
    /** Set in plugin sandbox HTML; pdf.js worker URL (`nodex-pdf-worker:`). */
    __NODEX_PDFJS_WORKER_SRC__?: string;
    /** Base URL of the headless HTTP API (no trailing slash); from query, localStorage, or the web API bar. */
    __NODEX_WEB_API_BASE__?: string;
    /** Base URL of the Fastify Mongo sync API (`@nodex/sync-api`), no trailing slash. */
    __NODEX_SYNC_API_BASE__?: string;
    /**
     * When true (or `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API=1`), `window.Nodex` WPN calls use the sync API
     * (`/wpn/*` on sync base + cloud JWT) instead of headless `/api/v1/wpn/*`.
     */
    __NODEX_WPN_USE_SYNC_API__?: boolean;
  }
}

export {};
