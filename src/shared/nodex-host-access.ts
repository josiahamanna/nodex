import type { NodexRendererApi } from "./nodex-renderer-api";

/**
 * Electron `contextBridge.exposeInMainWorld("Nodex", …)` makes `window.Nodex` non-writable.
 * Optional IndexedDB scratch (merged API) is held here; {@link getNodex} / {@link nodexDelegatingProxy}
 * forward to the overlay when set, otherwise to `window.Nodex`.
 */
let electronIdbScratchOverlay: NodexRendererApi | null = null;

/** Electron cloud WPN window: merged API (HTTP WPN + host IPC for plugins/files). */
let electronCloudWpnOverlay: NodexRendererApi | null = null;

/** ADR-016: local RxDB mirror read overlay (file vault + `NODEX_LOCAL_RXDB_WPN`). */
let electronWorkspaceRxdbOverlay: NodexRendererApi | null = null;

export function setElectronIdbScratchOverlay(api: NodexRendererApi | null): void {
  electronIdbScratchOverlay = api;
}

export function setElectronCloudWpnOverlay(api: NodexRendererApi | null): void {
  electronCloudWpnOverlay = api;
}

export function setElectronWorkspaceRxdbOverlay(api: NodexRendererApi | null): void {
  electronWorkspaceRxdbOverlay = api;
}

function activeNodexImpl(): NodexRendererApi {
  if (typeof window === "undefined") {
    throw new Error("Nodex: window is not available");
  }
  const bridged = window.Nodex;
  if (!bridged) {
    throw new Error("Nodex: window.Nodex is missing — install preload or web shim before use");
  }
  return (
    electronCloudWpnOverlay ??
    electronIdbScratchOverlay ??
    electronWorkspaceRxdbOverlay ??
    bridged
  );
}

/**
 * Prefer this over `window.Nodex` in the renderer so Electron IDB scratch can supply a merged API
 * without reassigning `window.Nodex`.
 */
export function getNodex(): NodexRendererApi {
  return nodexDelegatingProxy;
}

/** Stable reference for Redux `createNodexPlatformDeps({ notes: nodexDelegatingProxy })`. */
export const nodexDelegatingProxy = new Proxy({} as NodexRendererApi, {
  get(_target, prop, _receiver) {
    if (prop === "then") {
      return undefined;
    }
    const impl = activeNodexImpl();
    const value = Reflect.get(impl, prop, impl);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(impl);
    }
    return value;
  },
}) as NodexRendererApi;
