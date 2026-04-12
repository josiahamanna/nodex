import { setElectronWorkspaceRxdbOverlay } from "../../shared/nodex-host-access";
import { installElectronCloudWpnOverlay } from "./electron-cloud-wpn-bootstrap";
import { runElectronLegacyScratchWpnMigrationOnce } from "./electron-legacy-scratch-wpn-migration";
import { installElectronNodexIdbScratchProxy } from "./electron-nodex-idb-scratch";

void (async () => {
  installElectronCloudWpnOverlay();
  await runElectronLegacyScratchWpnMigrationOnce();
  installElectronNodexIdbScratchProxy();
  const { registerWorkspaceRxDbProjectRootHook } = await import("../workspace-rxdb/project-root-sync");
  registerWorkspaceRxDbProjectRootHook();
  const { createElectronWorkspaceRxdbNodexOverlay } = await import(
    "../workspace-rxdb/electron-workspace-rxdb-nodex-overlay"
  );
  const { importWorkspaceMirrorFromMainPayload } = await import("../workspace-rxdb/workspace-wpn-rxdb");
  if (
    typeof window !== "undefined" &&
    window.Nodex &&
    window.__NODEX_ELECTRON_WPN_BACKEND__ !== "cloud"
  ) {
    setElectronWorkspaceRxdbOverlay(createElectronWorkspaceRxdbNodexOverlay(window.Nodex));
  }
  if (typeof window !== "undefined" && window.nodexDesktop?.onWorkspaceRxdbMirrorUpdated) {
    window.nodexDesktop.onWorkspaceRxdbMirrorUpdated((payload) => {
      void importWorkspaceMirrorFromMainPayload(payload);
    });
  }
})();
