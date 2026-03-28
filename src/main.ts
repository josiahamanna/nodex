import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { appendPluginAudit } from "./core/plugin-audit";
import { pluginCacheManager } from "./core/plugin-cache-manager";
import { PluginLoader } from "./core/plugin-loader";
import { setPluginProgressSink } from "./core/plugin-progress";
import { packageManager } from "./core/package-manager";
import { registry } from "./core/registry";
import { IPC_CHANNELS } from "./shared/ipc-channels";
import {
  isSafePluginName,
  isValidNoteId,
  isValidNoteType,
} from "./shared/validators";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;
let pluginLoader: PluginLoader;

function getDialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.on("ready", () => {
  pluginCacheManager.ensureRoot();

  const userDataPath = app.getPath("userData");
  const pluginsPath = path.join(userDataPath, "plugins");
  console.log("[Main] Loading plugins from:", pluginsPath);

  pluginLoader = new PluginLoader(pluginsPath);

  createWindow();

  setPluginProgressSink((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_PROGRESS, payload);
    }
  });

  pluginLoader.loadAll(registry);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle(IPC_CHANNELS.GET_NOTE, async (_event, noteId?: string) => {
  const registeredTypes = registry.getRegisteredTypes();

  const sampleContent: Record<string, any> = {
    markdown: {
      content:
        "# Hello World\n\nThis is a **markdown** note rendered by a plugin!\n\n## Features\n\n- Dynamic plugin loading\n- Component registry\n- Hot reload support",
    },
    text: {
      content:
        "<h1>Rich Text Editor</h1><p>This note uses <strong>Tiptap</strong> for rich text editing.</p>",
    },
    code: {
      content:
        'function hello() {\n  console.log("Hello from Monaco!");\n}\n\nhello();',
      metadata: { language: "javascript" },
    },
  };

  const typeToTitle: Record<string, string> = {
    markdown: "Markdown Note",
    text: "Rich Text Note",
    code: "Code Editor",
  };

  const notes = registeredTypes.map((type, index) => ({
    id: String(index + 1),
    type: type,
    title:
      typeToTitle[type] ||
      `${type.charAt(0).toUpperCase() + type.slice(1)} Note`,
    content: sampleContent[type]?.content || `Sample content for ${type}`,
    metadata: sampleContent[type]?.metadata,
  }));

  if (noteId) {
    const note = notes.find((note) => note.id === noteId);
    if (!note) {
      throw new Error("Note not found");
    }
    return note;
  }

  return notes.length > 0 ? notes[0] : null;
});

ipcMain.handle(IPC_CHANNELS.GET_ALL_NOTES, async () => {
  const registeredTypes = registry.getRegisteredTypes();

  const typeToTitle: Record<string, string> = {
    markdown: "Markdown Note",
    text: "Rich Text Note",
    code: "Code Editor",
  };

  return registeredTypes.map((type, index) => ({
    id: String(index + 1),
    type: type,
    title:
      typeToTitle[type] ||
      `${type.charAt(0).toUpperCase() + type.slice(1)} Note`,
  }));
});

ipcMain.handle(IPC_CHANNELS.GET_COMPONENT, async (_event, type: string) => {
  if (!isValidNoteType(type)) {
    throw new Error("Invalid note type");
  }

  const component = registry.getComponent(type);
  if (!component) {
    return null;
  }

  return component;
});

ipcMain.handle(
  IPC_CHANNELS.GET_PLUGIN_HTML,
  async (_event, type: string, note: any) => {
    if (!isValidNoteType(type)) {
      throw new Error("Invalid note type");
    }

    const renderer = registry.getRenderer(type);
    if (!renderer) {
      return null;
    }

    try {
      const html = renderer.render(note);
      return html;
    } catch (error) {
      console.error(
        `[Main] Error rendering plugin HTML for type ${type}:`,
        error,
      );
      throw error;
    }
  },
);

ipcMain.handle(IPC_CHANNELS.GET_REGISTERED_TYPES, async () => {
  return registry.getRegisteredTypes();
});

ipcMain.handle(IPC_CHANNELS.SELECT_ZIP_FILE, async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Nodex plugin",
        extensions: ["Nodexplugin", "Nodexplugin-dev", "zip"],
      },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle(
  IPC_CHANNELS.EXPORT_PLUGIN_DEV,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const { dialog } = require("electron");
    const result = await dialog.showOpenDialog(getDialogParent(), {
      properties: ["openDirectory", "createDirectory"],
      title: "Export dev package (.Nodexplugin-dev)",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    try {
      const outPath = await pluginLoader.exportPluginAsDev(
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
    const result = await dialog.showOpenDialog(getDialogParent(), {
      properties: ["openDirectory", "createDirectory"],
      title: "Export production package (.Nodexplugin)",
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    try {
      const outPath = await pluginLoader.exportProductionPackage(
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
      return await pluginLoader.bundlePluginToLocalDist(pluginName);
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
    const result = await pluginLoader.installPluginDependencies(pluginName);
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
    const result = pluginLoader.clearPluginDependencyCache(pluginName);
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
  pluginLoader.clearAllPluginDependencyCaches();
  appendPluginAudit(userDataPath, {
    action: "clear-all-dep-caches",
    ok: true,
  });
  return { success: true };
});

ipcMain.handle(IPC_CHANNELS.GET_PLUGIN_CACHE_STATS, async () => {
  return pluginLoader.getPluginCacheStats();
});

ipcMain.handle(IPC_CHANNELS.IMPORT_PLUGIN, async (_event, zipPath: string) => {
  const userDataPath = app.getPath("userData");
  try {
    const { warnings } = await pluginLoader.importFromZip(zipPath, registry);

    appendPluginAudit(userDataPath, {
      action: "import",
      detail: path.basename(zipPath),
      ok: true,
    });

    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
    }

    return { success: true, warnings };
  } catch (error: any) {
    console.error("[Main] Plugin import failed:", error);
    appendPluginAudit(userDataPath, {
      action: "import",
      detail: path.basename(zipPath),
      ok: false,
    });
    return { success: false, error: error.message };
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
    return pluginLoader.getPluginInstallPlan(installedFolderName);
  },
);

ipcMain.handle(
  IPC_CHANNELS.GET_PLUGIN_RESOLVED_DEPS,
  async (_event, installedFolderName: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return { declared: {}, resolved: {}, error: "Invalid plugin name" };
    }
    return pluginLoader.getPluginResolvedDeps(installedFolderName);
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
    const result = await pluginLoader.runNpmOnPluginCache(
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

ipcMain.handle(IPC_CHANNELS.GET_PLUGIN_LOAD_ISSUES, async () => {
  return pluginLoader.getPluginLoadIssues();
});

ipcMain.handle(IPC_CHANNELS.GET_INSTALLED_PLUGINS, async () => {
  return pluginLoader.getLoadedPlugins();
});

ipcMain.handle(
  IPC_CHANNELS.UNINSTALL_PLUGIN,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const userDataPath = app.getPath("userData");
    try {
      pluginLoader.uninstallPlugin(pluginName, registry);
      appendPluginAudit(userDataPath, {
        action: "uninstall",
        pluginName,
        ok: true,
      });
      return { success: true };
    } catch (error) {
      console.error("[Main] Plugin uninstall failed:", error);
      appendPluginAudit(userDataPath, {
        action: "uninstall",
        pluginName,
        ok: false,
        detail:
          error instanceof Error ? error.message : "Unknown error",
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);
