import { setElectronWorkspaceRxdbOverlay } from "../../shared/nodex-host-access";
import { isElectronCloudWpnSession } from "../auth/electron-cloud-session";
import { syncElectronCloudWpnOverlayFromRunMode } from "./electron-cloud-wpn-bootstrap";
import { runElectronLegacyScratchWpnMigrationOnce } from "./electron-legacy-scratch-wpn-migration";
import { installElectronNodexIdbScratchProxy } from "./electron-nodex-idb-scratch";
import { isElectronUserAgent } from "../nodex-web-shim";

function isElectronRenderer(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("Electron");
}

void (async () => {
  syncElectronCloudWpnOverlayFromRunMode();
  await runElectronLegacyScratchWpnMigrationOnce();
  installElectronNodexIdbScratchProxy();
  /** Web dev imports this bootstrap too; skip RxDB/Electron-only modules (avoids Turbopack HMR noise). */
  if (typeof window === "undefined" || !isElectronRenderer()) {
    return;
  }
  const { registerWorkspaceRxDbProjectRootHook } = await import("../workspace-rxdb/project-root-sync");
  registerWorkspaceRxDbProjectRootHook();
  const { createElectronWorkspaceRxdbNodexOverlay } = await import(
    "../workspace-rxdb/electron-workspace-rxdb-nodex-overlay"
  );
  const { importWorkspaceMirrorFromMainPayload } = await import("../workspace-rxdb/workspace-wpn-rxdb");
  if (
    typeof window !== "undefined" &&
    window.Nodex &&
    isElectronUserAgent() &&
    !isElectronCloudWpnSession()
  ) {
    setElectronWorkspaceRxdbOverlay(createElectronWorkspaceRxdbNodexOverlay(window.Nodex));
  }
  if (typeof window !== "undefined" && window.nodexDesktop?.onWorkspaceRxdbMirrorUpdated) {
    window.nodexDesktop.onWorkspaceRxdbMirrorUpdated((payload) => {
      void importWorkspaceMirrorFromMainPayload(payload);
    });
  }
  if (typeof window !== "undefined" && window.nodexDesktop?.onWorkspaceWpnPersisted) {
    window.nodexDesktop.onWorkspaceWpnPersisted(() => {
      void import("../workspace-rxdb/wpn-persist-refetch").then((m) =>
        m.scheduleDebouncedNotesRefetchAfterWpnPersist(),
      );
    });
  }
})();
