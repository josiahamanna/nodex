import { installElectronCloudWpnOverlay } from "./electron-cloud-wpn-bootstrap";
import { runElectronLegacyScratchWpnMigrationOnce } from "./electron-legacy-scratch-wpn-migration";
import { installElectronNodexIdbScratchProxy } from "./electron-nodex-idb-scratch";

void (async () => {
  installElectronCloudWpnOverlay();
  await runElectronLegacyScratchWpnMigrationOnce();
  installElectronNodexIdbScratchProxy();
})();
