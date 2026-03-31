import "./main/ensure-safe-cwd";
import * as fs from "fs";
import * as path from "path";
import { app, BrowserWindow, protocol } from "electron";
import { runAppReady } from "./main/run-app-ready";
import { registerStaticIpcHandlers } from "./main/register-static-ipc";
import { createMainWindow } from "./main/create-main-window";

/**
 * Linux: Align Electron’s temp with `linux-chromium-tmp-env.ts` (TMPDIR before electron
 * loads). Portable / custom `userData` may differ from `~/.config/nodex`; this wins.
 * Opt out: `NODEX_SKIP_CHROMIUM_TEMP_REDIRECT=1`.
 */
function applyLinuxUserDataTemp(): void {
  if (process.platform !== "linux") {
    return;
  }
  if (process.env.NODEX_SKIP_CHROMIUM_TEMP_REDIRECT === "1") {
    return;
  }
  try {
    const dir = path.join(app.getPath("userData"), "chromium-tmp");
    fs.mkdirSync(dir, { recursive: true });
    app.setPath("temp", dir);
    process.env.TMPDIR = dir;
    process.env.TMP = dir;
    process.env.TEMP = dir;
  } catch {
    /* ignore */
  }
}

applyLinuxUserDataTemp();

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
 * Linux: `disable-dev-shm-usage` forces Chromium’s POSIX shmem fallback onto **system**
 * `/tmp` (not necessarily `TMPDIR`), which can loop-spam errors when `/tmp` is bad.
 * Default: off — use `/dev/shm` for browser shmem (normal Chrome behavior).
 * Opt in (e.g. tiny Docker `/dev/shm`): `NODEX_DISABLE_DEV_SHM_USAGE=1`
 */
function applyLinuxDevShmMitigation(): void {
  if (process.platform !== "linux") {
    return;
  }
  if (process.env.NODEX_DISABLE_DEV_SHM_USAGE === "1") {
    app.commandLine.appendSwitch("disable-dev-shm-usage");
  }
}

applyLinuxDevShmMitigation();

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
  /** Bundled pdf.js worker (`main_window/pdf.worker.min.mjs`) for plugin iframes — avoids `import(blob:)`. */
  {
    scheme: "nodex-pdf-worker",
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
