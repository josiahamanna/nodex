import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { PluginLoader } from "./core/plugin-loader";
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
  const userDataPath = app.getPath("userData");
  const pluginsPath = path.join(userDataPath, "plugins");
  console.log("[Main] Loading plugins from:", pluginsPath);

  pluginLoader = new PluginLoader(pluginsPath);
  pluginLoader.loadAll(registry);

  createWindow();
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

ipcMain.handle(IPC_CHANNELS.SELECT_OUTPUT_DIRECTORY, async () => {
  const { dialog } = require("electron");
  const result = await dialog.showOpenDialog(getDialogParent(), {
    properties: ["openDirectory", "createDirectory"],
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

ipcMain.handle(IPC_CHANNELS.IMPORT_PLUGIN, async (_event, zipPath: string) => {
  try {
    await pluginLoader.importFromZip(zipPath, registry);

    // Notify renderer to refresh plugin list
    if (mainWindow) {
      mainWindow.webContents.send("plugins-changed");
    }

    return { success: true };
  } catch (error: any) {
    console.error("[Main] Plugin import failed:", error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle(IPC_CHANNELS.GET_INSTALLED_PLUGINS, async () => {
  return pluginLoader.getLoadedPlugins();
});

ipcMain.handle(
  IPC_CHANNELS.UNINSTALL_PLUGIN,
  async (_event, pluginName: string) => {
    try {
      pluginLoader.uninstallPlugin(pluginName, registry);
      return { success: true };
    } catch (error) {
      console.error("[Main] Plugin uninstall failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);
