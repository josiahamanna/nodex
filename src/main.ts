import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as fs from "fs";
import * as path from "path";
import { appendPluginAudit } from "./core/plugin-audit";
import { pluginCacheManager } from "./core/plugin-cache-manager";
import { PluginLoader } from "./core/plugin-loader";
import { seedSamplePluginsToUserDir } from "./core/seed-user-plugins";
import { setPluginProgressSink } from "./core/plugin-progress";
import { packageManager } from "./core/package-manager";
import { registry } from "./core/registry";
import { IPC_CHANNELS } from "./shared/ipc-channels";
import { toFileUri } from "./shared/file-uri";
import {
  isSafePluginName,
  isValidNoteId,
  isValidNoteType,
} from "./shared/validators";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;
let pluginLoader: PluginLoader;

let ideWorkspaceWatch: fs.FSWatcher | null = null;
let ideWorkspaceWatchTimer: ReturnType<typeof setTimeout> | null = null;

function emitIdeWorkspaceFsChanged(): void {
  ideWorkspaceWatchTimer = null;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_IDE_WORKSPACE_FS_CHANGED);
  }
}

function setIdeWorkspaceWatch(pluginName: string | null): void {
  if (ideWorkspaceWatch) {
    ideWorkspaceWatch.close();
    ideWorkspaceWatch = null;
  }
  if (ideWorkspaceWatchTimer) {
    clearTimeout(ideWorkspaceWatchTimer);
    ideWorkspaceWatchTimer = null;
  }
  if (!pluginName) {
    return;
  }
  if (!isSafePluginName(pluginName)) {
    return;
  }
  const root = pluginLoader.getPluginWorkspaceAbsolutePath(pluginName);
  if (!root || !fs.existsSync(root)) {
    return;
  }
  try {
    ideWorkspaceWatch = fs.watch(
      root,
      { recursive: true },
      () => {
        if (ideWorkspaceWatchTimer) {
          clearTimeout(ideWorkspaceWatchTimer);
        }
        ideWorkspaceWatchTimer = setTimeout(emitIdeWorkspaceFsChanged, 320);
      },
    );
  } catch (e) {
    console.warn("[Main] ide workspace watch:", e);
  }
}

function getDialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
}

/** Shipped mandatory plugins (folder is copied to `Resources/core` when packaged). */
function resolveBundledCorePluginsDir(): string | null {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "core"),
      path.join(process.resourcesPath, "plugins", "core"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c;
      }
    }
    return null;
  }
  const devCore = path.join(__dirname, "../../plugins/core");
  return fs.existsSync(devCore) ? devCore : null;
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
  ipcMain.handle(IPC_CHANNELS.NPM_REGISTRY_SEARCH, async (_event, query: string) => {
    if (typeof query !== "string" || query.length > 200) {
      return {
        success: false,
        error: "Invalid query",
        results: [] as {
          name: string;
          version: string;
          description: string;
          popularity: number;
        }[],
      };
    }
    const q = query.trim();
    if (q.length === 0) {
      return { success: true, results: [] };
    }
    try {
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=20`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          success: false,
          error: `HTTP ${res.status}`,
          results: [],
        };
      }
      const data = (await res.json()) as {
        objects?: Array<{
          package: {
            name: string;
            version: string;
            description?: string;
          };
          score?: { detail?: { popularity?: number } };
        }>;
      };
      const results = (data.objects ?? [])
        .map((o) => ({
          name: o.package.name,
          version: o.package.version,
          description: o.package.description ?? "",
          popularity: o.score?.detail?.popularity ?? 0,
        }))
        .sort((a, b) => b.popularity - a.popularity);
      return { success: true, results };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
        results: [],
      };
    }
  });

  pluginCacheManager.ensureRoot();

  const userDataPath = app.getPath("userData");
  const pluginsPath = path.join(userDataPath, "plugins");
  const bundledCore = resolveBundledCorePluginsDir();
  const bundledRoots = bundledCore ? [bundledCore] : [];
  console.log("[Main] User plugins dir:", pluginsPath);
  if (bundledCore) {
    console.log("[Main] Bundled core plugins:", bundledCore);
  } else if (!app.isPackaged) {
    console.warn(
      "[Main] No bundled core plugins dir (expected ./plugins/core for dev).",
    );
  }

  seedSamplePluginsToUserDir(pluginsPath);

  pluginLoader = new PluginLoader(pluginsPath, bundledRoots);

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
      const html = await Promise.resolve(renderer.render(note));
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

ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST_WORKSPACE_FOLDERS, async () => {
  return pluginLoader.listPluginWorkspaceFolders();
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD_NODEX_FROM_PARENT, async () => {
  const parent = getDialogParent();
  if (!parent) {
    return {
      success: false,
      cancelled: true,
      added: [],
      warnings: [],
      errors: [],
    };
  }
  const result = await dialog.showOpenDialog(parent, {
    properties: ["openDirectory"],
    title:
      "Parent folder — immediate subfolders containing .nodexplugin are registered",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, cancelled: true, added: [], warnings: [], errors: [] };
  }
  const scan = pluginLoader.loadNodexPluginsFromParentDir(result.filePaths[0]);
  return { success: true, ...scan };
});

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_REMOVE_EXTERNAL_PLUGIN,
  async (_event, pluginId: string) => {
    if (!isSafePluginName(pluginId)) {
      return { success: false, error: "Invalid plugin id" };
    }
    const ok = pluginLoader.removeExternalPluginWorkspace(pluginId);
    return ok
      ? { success: true }
      : {
          success: false,
          error:
            "Not found in external list (sources/ plugins are not removed here)",
        };
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_RENAME_SOURCE_PATH,
  async (
    _event,
    installedFolderName: string,
    fromRelative: string,
    toRelative: string,
  ) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      pluginLoader.renamePluginSourcePath(
        installedFolderName,
        fromRelative,
        toRelative,
      );
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_COPY_SOURCE_WITHIN_WORKSPACE,
  async (
    _event,
    installedFolderName: string,
    fromRelative: string,
    toRelative: string,
  ) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      pluginLoader.copyPluginSourceWithinWorkspace(
        installedFolderName,
        fromRelative,
        toRelative,
      );
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_GET_SOURCE_ENTRY_KIND,
  async (_event, installedFolderName: string, relativePath: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return "missing" as const;
    }
    if (typeof relativePath !== "string") {
      return "missing" as const;
    }
    return pluginLoader.getPluginSourceEntryKind(
      installedFolderName,
      relativePath,
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_COPY_DIST_TO_FOLDER,
  async (_event, installedFolderName: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const parent = getDialogParent();
    if (!parent) {
      return { success: false, error: "No window for dialog" };
    }
    const pick = await dialog.showOpenDialog(parent, {
      properties: ["openDirectory", "createDirectory"],
      title: "Copy dist/ contents into this folder",
    });
    if (pick.canceled || pick.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    return pluginLoader.copyPluginDistContentsToDirectory(
      installedFolderName,
      pick.filePaths[0],
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IDE_SET_WORKSPACE_WATCH,
  async (_event, pluginName: string | null) => {
    setIdeWorkspaceWatch(
      pluginName && isSafePluginName(pluginName) ? pluginName : null,
    );
    return { success: true };
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_LIST_SOURCE_FILES,
  async (_event, installedFolderName: string) => {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }
    return pluginLoader.listPluginSourceFiles(installedFolderName);
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_READ_SOURCE_FILE,
  async (_event, installedFolderName: string, relativePath: string) => {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }
    return pluginLoader.readPluginSourceFile(
      installedFolderName,
      relativePath,
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_WRITE_SOURCE_FILE,
  async (
    _event,
    installedFolderName: string,
    relativePath: string,
    content: string,
  ) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      pluginLoader.writePluginSourceFile(
        installedFolderName,
        relativePath,
        content,
      );
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_MKDIR_SOURCE,
  async (_event, installedFolderName: string, relativeDir: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      pluginLoader.mkdirPluginSourceDir(installedFolderName, relativeDir);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_CREATE_SOURCE_FILE,
  async (
    _event,
    installedFolderName: string,
    relativePath: string,
    content?: string,
  ) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      pluginLoader.createPluginSourceFile(
        installedFolderName,
        relativePath,
        typeof content === "string" ? content : "",
      );
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_DELETE_SOURCE_PATH,
  async (_event, installedFolderName: string, relativePath: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    try {
      pluginLoader.deletePluginSourcePath(installedFolderName, relativePath);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_FILES, async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(getDialogParent(), {
    properties: ["openFile", "multiSelections"],
    title: "Import files into plugin workspace",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths;
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_DIRECTORY, async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(getDialogParent(), {
    properties: ["openDirectory"],
    title: "Import folder into plugin workspace",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IMPORT_FILES_INTO_WORKSPACE,
  async (
    _event,
    installedFolderName: string,
    absolutePaths: string[],
    destRelativeBase?: string,
  ) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    if (!Array.isArray(absolutePaths)) {
      return { success: false, error: "Invalid paths" };
    }
    return pluginLoader.importExternalFilesIntoWorkspace(
      installedFolderName,
      absolutePaths,
      typeof destRelativeBase === "string" ? destRelativeBase : "",
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IMPORT_DIRECTORY_INTO_WORKSPACE,
  async (
    _event,
    installedFolderName: string,
    absoluteDir: string,
    destRelativeBase?: string,
  ) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    if (typeof absoluteDir !== "string") {
      return { success: false, error: "Invalid directory" };
    }
    return pluginLoader.importExternalDirectoryIntoWorkspace(
      installedFolderName,
      absoluteDir,
      typeof destRelativeBase === "string" ? destRelativeBase : "",
    );
  },
);

function toFileUriForMonaco(absPath: string): string {
  return toFileUri(absPath);
}

ipcMain.handle(IPC_CHANNELS.PLUGIN_TYPECHECK, async (_event, pluginName: string) => {
  if (!isSafePluginName(pluginName)) {
    return {
      success: false,
      error: "Invalid plugin name",
      diagnostics: [] as {
        relativePath: string;
        line: number;
        column: number;
        message: string;
        category: "error" | "warning" | "suggestion";
        code: number | undefined;
      }[],
    };
  }
  try {
    return pluginLoader.runTypecheckOnPluginWorkspace(pluginName);
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      diagnostics: [],
    };
  }
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_IDE_TYPINGS, async () => {
  const libs: { fileName: string; content: string }[] = [];
  const tryAdd = (request: string) => {
    try {
      const resolved = require.resolve(request);
      const content = fs.readFileSync(resolved, "utf8");
      libs.push({
        fileName: toFileUriForMonaco(resolved),
        content,
      });
    } catch {
      // optional typings
    }
  };
  tryAdd("@types/react/index.d.ts");
  tryAdd("@types/react-dom/index.d.ts");
  return { libs };
});

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IDE_PLUGIN_TYPINGS,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return null;
    }
    return pluginLoader.getIdePluginVirtualTypings(pluginName);
  },
);

ipcMain.handle(IPC_CHANNELS.PLUGIN_RELOAD_REGISTRY, async () => {
  try {
    pluginLoader.reload(registry);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
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
