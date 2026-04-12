import { buildWorkspaceVaultKey } from "../../shared/workspace-vault-key";
import { getNodex } from "../../shared/nodex-host-access";
import { isElectronUserAgent } from "../nodex-web-shim";
import { isLocalRxdbWpnMirrorEnabled } from "./flags";
import {
  importWorkspaceMirrorFromMainPayload,
  touchWorkspaceRxDbForVaultKey,
} from "./workspace-wpn-rxdb";

let hooked = false;

/**
 * ADR-016 Phase 2: when `NODEX_LOCAL_RXDB_WPN` is enabled, keep an RxDB handle warm for the current vault key
 * derived from workspace roots (sorted join). Writes still go through IPC/JSON until later phases.
 */
export function registerWorkspaceRxDbProjectRootHook(): void {
  if (hooked || typeof window === "undefined" || !isElectronUserAgent()) {
    return;
  }
  if (!isLocalRxdbWpnMirrorEnabled()) {
    return;
  }
  const nodex = window.Nodex;
  if (!nodex) {
    return;
  }
  hooked = true;
  nodex.onProjectRootChanged(() => {
    void refreshWorkspaceRxDbMirror();
  });
  void refreshWorkspaceRxDbMirror();
}

async function refreshWorkspaceRxDbMirror(): Promise<void> {
  try {
    const state = await getNodex().getProjectState();
    const roots = Array.isArray(state.workspaceRoots) ? state.workspaceRoots : [];
    if (roots.length === 0) {
      return;
    }
    const vaultKey = buildWorkspaceVaultKey(roots);
    await touchWorkspaceRxDbForVaultKey(vaultKey);
    try {
      const pull = await getNodex().pullWorkspaceRxdbMirrorPayload();
      if (pull.ok) {
        await importWorkspaceMirrorFromMainPayload(pull.payload);
      }
    } catch {
      /* cloud window or IPC unavailable */
    }
  } catch {
    /* ignore */
  }
}
