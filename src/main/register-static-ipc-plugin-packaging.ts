import { app, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { appendPluginAudit } from "../core/plugin-audit";
import { packageManager } from "../core/package-manager";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { isSafePluginName } from "../shared/validators";
import { ctx, getPluginLoader } from "./main-context";
import { getDialogParent, showOpenDialogWithParent } from "./main-helpers";
import { registry } from "../core/registry";
import { emitPluginProgress } from "../core/plugin-progress";

export function registerStaticIpcPluginPackagingHandlers(): void {
ipcMain.handle(IPC_CHANNELS.SELECT_ZIP_FILE, async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Nodex plugin",
        extensions: [
          "nodexplugin",
          "nodexplugin-dev",
          "Nodexplugin",
          "Nodexplugin-dev",
          "zip",
        ],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle(
  IPC_CHANNELS.PUBLISH_PLUGIN_AS_FILE,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const { dialog } = require("electron");
    const userDataPath = app.getPath("userData");
    try {
      const defaultFile = `${pluginName}.nodexplugin`;

      const parent = getDialogParent();
      const save = parent
        ? await dialog.showSaveDialog(parent, {
            title: "Publish plugin as file (.nodexplugin)",
            defaultPath: defaultFile,
            filters: [{ name: "Nodex plugin", extensions: ["nodexplugin"] }],
            properties: ["createDirectory", "showOverwriteConfirmation"],
          })
        : await dialog.showSaveDialog({
        title: "Publish plugin as file (.nodexplugin)",
        defaultPath: defaultFile,
        filters: [{ name: "Nodex plugin", extensions: ["nodexplugin"] }],
        properties: ["createDirectory", "showOverwriteConfirmation"],
      });
      if (save.canceled || !save.filePath) {
        return { success: false, error: "Cancelled" };
      }
      const outFile = save.filePath.toLowerCase().endsWith(".nodexplugin")
        ? save.filePath
        : `${save.filePath}.nodexplugin`;

      emitPluginProgress({
        op: "npm",
        phase: "start",
        pluginName,
        message: "Install dependencies…",
      });
      const install = await getPluginLoader().installPluginDependencies(pluginName);
      if (!install.success) {
        emitPluginProgress({
          op: "npm",
          phase: "error",
          pluginName,
          message: install.error ?? "npm install failed",
        });
        appendPluginAudit(userDataPath, {
          action: "publish",
          pluginName,
          ok: false,
          detail: install.error,
        });
        return { success: false, error: install.error ?? "npm install failed" };
      }
      emitPluginProgress({
        op: "npm",
        phase: "done",
        pluginName,
        message: "Dependencies installed.",
      });

      const stagingParent = fs.mkdtempSync(path.join(os.tmpdir(), "nodex-publish-"));
      try {
        const produced = await getPluginLoader().exportProductionPackage(
          pluginName,
          stagingParent,
        );

        // Ensure lowercase extension on final output.
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.copyFileSync(produced, outFile);
      } finally {
        fs.rmSync(stagingParent, { recursive: true, force: true });
      }

      appendPluginAudit(userDataPath, {
        action: "publish",
        pluginName,
        ok: true,
        detail: path.basename(outFile),
      });

      emitPluginProgress({
        op: "export",
        phase: "done",
        pluginName,
        message: `Published: ${path.basename(outFile)}`,
      });

      return { success: true, path: outFile };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emitPluginProgress({
        op: "export",
        phase: "error",
        pluginName,
        message: msg,
      });
      appendPluginAudit(userDataPath, {
        action: "publish",
        pluginName,
        ok: false,
        detail: msg,
      });
      return { success: false, error: msg };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.EXPORT_PLUGIN_DEV,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const { dialog } = require("electron");
    const result = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Export dev package (.Nodexplugin-dev)",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    try {
      const outPath = await getPluginLoader().exportPluginAsDev(
        pluginName,
        result.filePaths[0],
      );
      return { success: true, path: outPath };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.EXPORT_PLUGIN_PRODUCTION,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const { dialog } = require("electron");
    const result = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Export production package (.Nodexplugin)",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    try {
      const outPath = await getPluginLoader().exportProductionPackage(
        pluginName,
        result.filePaths[0],
      );
      return { success: true, path: outPath };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.BUNDLE_PLUGIN_LOCAL,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      return await getPluginLoader().bundlePluginToLocalDist(pluginName);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.INSTALL_PLUGIN_DEPENDENCIES,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const userDataPath = app.getPath("userData");
    const result = await getPluginLoader().installPluginDependencies(pluginName);
    if (result.log) {
      console.log("[Main] npm install log:\n", result.log);
    }
    appendPluginAudit(userDataPath, {
      action: "install-deps",
      pluginName,
      ok: result.success,
      detail: result.error,
    });
    return result;
  },
);

ipcMain.handle(
  IPC_CHANNELS.CLEAR_PLUGIN_DEPENDENCY_CACHE,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const userDataPath = app.getPath("userData");
    const result = getPluginLoader().clearPluginDependencyCache(pluginName);
    appendPluginAudit(userDataPath, {
      action: "clear-dep-cache",
      pluginName,
      ok: result.success,
      detail: result.error,
    });
    return result;
  },
);

ipcMain.handle(IPC_CHANNELS.CLEAR_ALL_PLUGIN_DEPENDENCY_CACHES, async () => {
  const userDataPath = app.getPath("userData");
  getPluginLoader().clearAllPluginDependencyCaches();
  appendPluginAudit(userDataPath, {
    action: "clear-all-dep-caches",
    ok: true,
  });
  return { success: true };
});

ipcMain.handle(IPC_CHANNELS.GET_PLUGIN_CACHE_STATS, async () => {
  return getPluginLoader().getPluginCacheStats();
});

ipcMain.handle(IPC_CHANNELS.IMPORT_PLUGIN, async (_event, zipPath: string) => {
  const userDataPath = app.getPath("userData");
  try {
    const { warnings } = await getPluginLoader().importFromZip(zipPath, registry);

    appendPluginAudit(userDataPath, {
      action: "import",
      detail: path.basename(zipPath),
      ok: true,
    });

    if (ctx.mainWindow) {
      ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
    }

    return { success: true, warnings };
  } catch (error: unknown) {
    console.error("[Main] Plugin import failed:", error);
    appendPluginAudit(userDataPath, {
      action: "import",
      detail: path.basename(zipPath),
      ok: false,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.VALIDATE_PLUGIN_ZIP, async (_event, zipPath: string) => {
  return packageManager.validatePackage(zipPath);
});

ipcMain.handle(
  IPC_CHANNELS.GET_PLUGIN_INSTALL_PLAN,
  async (_event, installedFolderName: string) => {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }
    return getPluginLoader().getPluginInstallPlan(installedFolderName);
  },
);

ipcMain.handle(
  IPC_CHANNELS.GET_PLUGIN_RESOLVED_DEPS,
  async (_event, installedFolderName: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return { declared: {}, resolved: {}, error: "Invalid plugin name" };
    }
    return getPluginLoader().getPluginResolvedDeps(installedFolderName);
  },
);

ipcMain.handle(
  IPC_CHANNELS.RUN_PLUGIN_CACHE_NPM,
  async (_event, installedFolderName: string, npmArgs: string[]) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    if (!Array.isArray(npmArgs) || npmArgs.length === 0) {
      return { success: false, error: "npm args required" };
    }
    const userDataPath = app.getPath("userData");
    const result = await getPluginLoader().runNpmOnPluginCache(
      installedFolderName,
      npmArgs,
    );
    appendPluginAudit(userDataPath, {
      action: "npm-cache",
      pluginName: installedFolderName,
      detail: npmArgs.join(" "),
      ok: result.success,
    });
    return result;
  },
);
}
