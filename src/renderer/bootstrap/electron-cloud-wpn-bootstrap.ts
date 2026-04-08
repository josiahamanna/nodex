import type { NodexRendererApi } from "../../shared/nodex-renderer-api";
import { setElectronCloudWpnOverlay } from "../../shared/nodex-host-access";
import { createWebNodexApi, isElectronUserAgent } from "../nodex-web-shim";

/** Methods that must hit sync-api / headless WPN instead of the file-vault IPC bridge. */
const ELECTRON_CLOUD_WPN_DELEGATE_KEYS = new Set<keyof NodexRendererApi>([
  "getNote",
  "getAllNotes",
  "createNote",
  "renameNote",
  "deleteNotes",
  "moveNote",
  "moveNotesBulk",
  "pasteSubtree",
  "saveNotePluginUiState",
  "saveNoteContent",
  "patchNoteMetadata",
  "getRegisteredTypes",
  "getSelectableNoteTypes",
  "getProjectState",
  "getShellLayout",
  "setShellLayout",
  "nodexUndo",
  "nodexRedo",
  "wpnListWorkspaces",
  "wpnCreateWorkspace",
  "wpnUpdateWorkspace",
  "wpnDeleteWorkspace",
  "wpnListProjects",
  "wpnCreateProject",
  "wpnUpdateProject",
  "wpnDeleteProject",
  "wpnListNotes",
  "wpnListAllNotesWithContext",
  "wpnListBacklinksToNote",
  "wpnGetNote",
  "wpnGetExplorerState",
  "wpnSetExplorerState",
  "wpnCreateNoteInProject",
  "wpnPreviewNoteTitleVfsImpact",
  "wpnPatchNote",
  "wpnDeleteNotes",
  "wpnMoveNote",
  "wpnDuplicateNoteSubtree",
]);

/**
 * Cloud WPN BrowserWindow: route note + WPN calls through the same HTTP layer as the web app
 * (Mongo via sync-api when configured). File-vault IPC must not receive WPN mutations for this window.
 */
export function installElectronCloudWpnOverlay(): void {
  if (typeof window === "undefined" || !isElectronUserAgent()) {
    return;
  }
  if (window.__NODEX_ELECTRON_WPN_BACKEND__ !== "cloud") {
    return;
  }
  window.__NODEX_WPN_USE_SYNC_API__ = true;

  const bridged = window.Nodex;
  if (!bridged) {
    return;
  }

  const webApi = createWebNodexApi("");

  const merged = new Proxy(bridged, {
    get(target, prop, receiver) {
      if (
        typeof prop === "string" &&
        ELECTRON_CLOUD_WPN_DELEGATE_KEYS.has(prop as keyof NodexRendererApi)
      ) {
        const v = Reflect.get(webApi, prop, webApi) as unknown;
        if (typeof v === "function") {
          return (v as (...a: unknown[]) => unknown).bind(webApi);
        }
        return v;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as NodexRendererApi;

  setElectronCloudWpnOverlay(merged);
}
