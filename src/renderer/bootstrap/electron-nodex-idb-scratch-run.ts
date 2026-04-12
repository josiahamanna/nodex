import { setElectronWorkspaceRxdbOverlay } from "../../shared/nodex-host-access";
import { isElectronCloudWpnSession } from "../auth/electron-cloud-session";
import { syncElectronCloudWpnOverlayFromRunMode } from "./electron-cloud-wpn-bootstrap";
import { runElectronLegacyScratchWpnMigrationOnce } from "./electron-legacy-scratch-wpn-migration";
import { installElectronNodexIdbScratchProxy } from "./electron-nodex-idb-scratch";

void (async () => {
  syncElectronCloudWpnOverlayFromRunMode();
  await runElectronLegacyScratchWpnMigrationOnce();
  installElectronNodexIdbScratchProxy();
  const { registerWorkspaceRxDbProjectRootHook } = await import("../workspace-rxdb/project-root-sync");
  registerWorkspaceRxDbProjectRootHook();
  const { createElectronWorkspaceRxdbNodexOverlay } = await import(
    "../workspace-rxdb/electron-workspace-rxdb-nodex-overlay"
  );
  const { importWorkspaceMirrorFromMainPayload } = await import("../workspace-rxdb/workspace-wpn-rxdb");
  if (typeof window !== "undefined" && window.Nodex && !isElectronCloudWpnSession()) {
    setElectronWorkspaceRxdbOverlay(createElectronWorkspaceRxdbNodexOverlay(window.Nodex));
  }
  if (typeof window !== "undefined" && window.nodexDesktop?.onWorkspaceRxdbMirrorUpdated) {
    window.nodexDesktop.onWorkspaceRxdbMirrorUpdated((payload) => {
      void importWorkspaceMirrorFromMainPayload(payload);
    });
  }
})();
