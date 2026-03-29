import { registerStaticIpcNotesRegistryHandlers } from "./register-static-ipc-notes-registry";
import { registerStaticIpcPluginIdeMaintHandlers } from "./register-static-ipc-plugin-ide-maint";
import { registerStaticIpcPluginPackagingHandlers } from "./register-static-ipc-plugin-packaging";
import { registerStaticIpcPluginWorkspaceHandlers } from "./register-static-ipc-plugin-workspace";

export function registerStaticIpcHandlers(): void {
  registerStaticIpcNotesRegistryHandlers();
  registerStaticIpcPluginPackagingHandlers();
  registerStaticIpcPluginWorkspaceHandlers();
  registerStaticIpcPluginIdeMaintHandlers();
}
