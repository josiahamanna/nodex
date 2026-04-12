import type { NodexRendererApi } from "../../shared/nodex-renderer-api";
import { setElectronIdbScratchOverlay } from "../../shared/nodex-host-access";
import { isElectronCloudWpnSession } from "../auth/electron-cloud-session";
import { webScratchPlainStubOverrides } from "../wpnscratch/web-scratch-nodex-api";

function isElectronRenderer(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");
}

/**
 * Electron `contextBridge` exposes a read-only `window.Nodex`, so we cannot replace it with a Proxy.
 * Instead, merge web scratch (IndexedDB) into {@link setElectronIdbScratchOverlay} when the host has
 * no workspace roots; {@link getNodex} / {@link nodexDelegatingProxy} forward to that overlay.
 */
export function installElectronNodexIdbScratchProxy(): void {
  if (typeof window === "undefined" || !isElectronRenderer()) {
    return;
  }
  const bridged = window.Nodex;
  if (!bridged) {
    return;
  }

  const recompute = async (): Promise<void> => {
    if (isElectronCloudWpnSession()) {
      setElectronIdbScratchOverlay(null);
      return;
    }
    setElectronIdbScratchOverlay(null);
    const state = await bridged.getProjectState();
    const roots = Array.isArray(state.workspaceRoots) ? state.workspaceRoots : [];
    if (roots.length > 0) {
      setElectronIdbScratchOverlay(null);
      return;
    }
    const merged = {
      ...bridged,
      ...webScratchPlainStubOverrides(),
    } as NodexRendererApi;
    setElectronIdbScratchOverlay(merged);
  };

  bridged.onProjectRootChanged(() => {
    void recompute();
  });
  void recompute();
}
