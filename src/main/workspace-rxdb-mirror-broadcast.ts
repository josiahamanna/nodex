import * as fs from "fs";
import {
  flushWorkspaceStoreFromMirrorPayload,
  getNotesDatabase,
  setWorkspaceStorePersistHook,
} from "../core/workspace-store";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { buildWorkspaceVaultKey } from "../shared/workspace-vault-key";
import {
  isLocalRxdbWpnMirrorEnabledEnv,
  isWorkspaceRxdbAuthorityEnvEnabled,
} from "../shared/workspace-rxdb-env";
import type { WorkspaceRxdbMirrorPayloadV1 } from "../shared/workspace-rxdb-mirror-payload";
import { isWorkspaceRxdbMirrorPayloadV1 } from "../shared/workspace-rxdb-mirror-payload";
import { ctx } from "./main-context";

const DEBOUNCE_MS = 150;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export function buildWorkspaceRxdbMirrorPayload(): WorkspaceRxdbMirrorPayloadV1 | null {
  const store = getNotesDatabase();
  if (!store?.diskPersistence || store.roots.length === 0) {
    return null;
  }
  const vaultKey = buildWorkspaceVaultKey(store.roots);
  const slots = store.roots.map((root, i) => {
    const fp = store.filePathForSlot(i);
    const json = fs.existsSync(fp) ? fs.readFileSync(fp, "utf8") : "{}";
    return { root, path: fp, json };
  });
  return { v: 1, vaultKey, slots };
}

export function scheduleWorkspaceRxdbMirrorBroadcast(): void {
  if (!isLocalRxdbWpnMirrorEnabledEnv()) {
    return;
  }
  if (isWorkspaceRxdbAuthorityEnvEnabled()) {
    return;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const win = ctx.mainWindow;
    if (!win || win.isDestroyed()) {
      return;
    }
    const payload = buildWorkspaceRxdbMirrorPayload();
    if (!payload) {
      return;
    }
    win.webContents.send(IPC_CHANNELS.WORKSPACE_RXDB_MIRROR_UPDATED, payload);
  }, DEBOUNCE_MS);
}

export function registerWorkspaceRxdbMirrorPersistHook(): void {
  setWorkspaceStorePersistHook(() => {
    scheduleWorkspaceRxdbMirrorBroadcast();
  });
}

export function flushWorkspaceMirrorFromRenderer(
  payload: unknown,
): { ok: true } | { ok: false; error: string } {
  if (!isWorkspaceRxdbAuthorityEnvEnabled()) {
    return {
      ok: false,
      error: "Set NODEX_WORKSPACE_RXDB_AUTHORITY=1 to flush workspace JSON from the renderer",
    };
  }
  if (!isWorkspaceRxdbMirrorPayloadV1(payload)) {
    return { ok: false, error: "Invalid mirror payload" };
  }
  const store = getNotesDatabase();
  if (!store?.diskPersistence) {
    return { ok: false, error: "No workspace store open" };
  }
  try {
    flushWorkspaceStoreFromMirrorPayload(store, payload);
    store.loadPrimaryLegacyIntoMemory();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
