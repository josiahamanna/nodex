import { app, BrowserWindow, protocol } from "electron";
import { runAppReady } from "./main/run-app-ready";
import { registerStaticIpcHandlers } from "./main/register-static-ipc";
import { createMainWindow } from "./main/create-main-window";

/**
 * Linux (especially AppImage): Chromium may abort if `chrome-sandbox` is present but
 * not SUID root (4755). Portable mounts under `/tmp/.mount_*` often hit this.
 * Must run before app ready.
 */
function applyLinuxSandboxMitigations(): void {
  if (process.platform !== "linux") {
    return;
  }
  app.commandLine.appendSwitch("no-sandbox");
}

applyLinuxSandboxMitigations();

/**
 * Linux: MP4 in <video> can crash or loop-restart the GPU process (gbm_bo_import,
 * CreateSharedImage) on some Mesa/Wayland/NVIDIA stacks. Mitigate before app ready.
 * Opt out: NODEX_HW_VIDEO=1 to keep HW decode. Nuclear: NODEX_DISABLE_HARDWARE_ACCELERATION=1.
 */
function applyLinuxGpuVideoMitigations(): void {
  if (process.platform !== "linux") {
    return;
  }
  if (process.env.NODEX_DISABLE_HARDWARE_ACCELERATION === "1") {
    app.disableHardwareAcceleration();
    return;
  }
  if (process.env.NODEX_HW_VIDEO === "1") {
    return;
  }
  app.commandLine.appendSwitch("disable-accelerated-video-decode");
}

applyLinuxGpuVideoMitigations();

protocol.registerSchemesAsPrivileged([
  {
    scheme: "nodex-asset",
    privileges: {
      standard: true,
      secure: true,
      /** Lets nested PDF/media frames load despite strict CSP in host / srcdoc. */
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  /**
   * Back-compat alias: early UI/content used `node-asset:` (missing "x").
   * Keep this registered so existing notes and plugins don't 404.
   */
  {
    scheme: "node-asset",
    privileges: {
      standard: true,
      secure: true,
      bypassCSP: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

registerStaticIpcHandlers();

app.on("ready", () => {
  runAppReady();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
