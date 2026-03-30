import { registerStaticIpcNotesRegistryHandlers } from "./register-static-ipc-notes-registry";
import { registerStaticIpcPluginIdeMaintHandlers } from "./register-static-ipc-plugin-ide-maint";
import { registerStaticIpcPluginPackagingHandlers } from "./register-static-ipc-plugin-packaging";
import { registerStaticIpcPluginWorkspaceHandlers } from "./register-static-ipc-plugin-workspace";
import { registerRunAppReadyAssetsUndoIpc } from "./register-run-app-ready-assets-undo-ipc";

export function registerStaticIpcHandlers(): void {
  registerStaticIpcNotesRegistryHandlers();
  registerStaticIpcPluginPackagingHandlers();
  registerStaticIpcPluginWorkspaceHandlers();
  registerStaticIpcPluginIdeMaintHandlers();
  /** Asset listing/import + undo/redo; registered early so renderer cannot outrace `app.ready` (e.g. HMR). */
  registerRunAppReadyAssetsUndoIpc();
}
