import { spawn } from "child_process";
import { app, dialog, ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { appendPluginAudit } from "../core/plugin-audit";
import { packageManager } from "../core/package-manager";
import { resolveNodexPluginUiMonacoLib } from "../core/resolve-nodex-plugin-ui";
import {
  ensureNotesSeeded,
  createNote as createNoteInStore,
  getFirstNote,
  getNoteById,
  getNotesFlat,
  renameNote as renameNoteInStore,
  setNoteContent as setNoteContentInStore,
  setNotePluginUiState,
} from "../core/notes-store";
import { registry } from "../core/registry";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import type { Note } from "../shared/nodex-renderer-api";
import { toFileUri } from "../shared/file-uri";
import {
  isSafePluginName,
  isValidNoteId,
  isValidNoteType,
} from "../shared/validators";
import { getNodexUserPluginsDir } from "../core/nodex-paths";
import { seedSamplePluginsToUserDir } from "../core/seed-user-plugins";
import { ctx, getPluginLoader } from "./main-context";
import {
  assertProjectOpenForNotes,
  broadcastPluginsChanged,
  persistNotes,
  setIdeWorkspaceWatch,
  showOpenDialogWithParent,
} from "./main-helpers";
import { pushNotesUndoSnapshot } from "../core/nodex-undo";

function toFileUriForMonaco(absPath: string): string {
  return toFileUri(absPath);
}

export function registerStaticIpcHandlers(): void {
ipcMain.handle(IPC_CHANNELS.GET_NOTE, async (_event, noteId?: string) => {
  if (!ctx.projectRootPath) {
    if (noteId !== undefined) {
      throw new Error("Open a project folder first (Notes → Open project).");
    }
    return null;
  }
  const registeredTypes = registry.getRegisteredTypes();
  ensureNotesSeeded(registeredTypes);

  if (noteId) {
    if (!isValidNoteId(noteId)) {
      throw new Error("Invalid note id");
    }
    const note = getNoteById(noteId);
    if (!note) {
      throw new Error("Note not found");
    }
    const { id, type, title, content, metadata } = note;
    return { id, type, title, content, metadata };
  }

  const first = getFirstNote();
  if (!first) {
    return null;
  }
  const { id, type, title, content, metadata } = first;
  return { id, type, title, content, metadata };
});

ipcMain.handle(IPC_CHANNELS.GET_ALL_NOTES, async () => {
  if (!ctx.projectRootPath) {
    return [];
  }
  const registeredTypes = registry.getRegisteredTypes();
  ensureNotesSeeded(registeredTypes);
  return getNotesFlat();
});

ipcMain.handle(
  IPC_CHANNELS.CREATE_NOTE,
  async (
    _event,
    payload: { anchorId?: string; relation: string; type: string },
  ) => {
    assertProjectOpenForNotes();
    const registeredTypes = registry.getRegisteredTypes();
    ensureNotesSeeded(registeredTypes);

    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid payload");
    }
    const { type } = payload;
    if (!isValidNoteType(type) || !registeredTypes.includes(type)) {
      throw new Error("Invalid note type");
    }
    const rel = payload.relation;
    if (rel !== "child" && rel !== "sibling" && rel !== "root") {
      throw new Error("Invalid relation");
    }
    let anchorId = payload.anchorId;
    if (anchorId !== undefined && !isValidNoteId(anchorId)) {
      throw new Error("Invalid anchor id");
    }
    if (rel === "root") {
      anchorId = undefined;
    }
    pushNotesUndoSnapshot();
    const created = createNoteInStore({
      anchorId,
      relation: rel,
      type,
    });
    persistNotes();
    return { id: created.id };
  },
);

ipcMain.handle(IPC_CHANNELS.RENAME_NOTE, async (_event, id: string, title: string) => {
  assertProjectOpenForNotes();
  const registeredTypes = registry.getRegisteredTypes();
  ensureNotesSeeded(registeredTypes);

  if (!isValidNoteId(id)) {
    throw new Error("Invalid note id");
  }
  if (typeof title !== "string") {
    throw new Error("Invalid title");
  }
  pushNotesUndoSnapshot();
  renameNoteInStore(id, title);
  persistNotes();
});

ipcMain.handle(
  IPC_CHANNELS.SAVE_NOTE_PLUGIN_UI_STATE,
  async (_event, noteId: string, state: unknown) => {
    assertProjectOpenForNotes();
    const registeredTypes = registry.getRegisteredTypes();
    ensureNotesSeeded(registeredTypes);

    if (!isValidNoteId(noteId)) {
      throw new Error("Invalid note id");
    }
    setNotePluginUiState(noteId, state);
    persistNotes();
  },
);

ipcMain.handle(
  IPC_CHANNELS.SAVE_NOTE_CONTENT,
  async (_event, noteId: string, content: string) => {
    assertProjectOpenForNotes();
    const registeredTypes = registry.getRegisteredTypes();
    ensureNotesSeeded(registeredTypes);

    if (!isValidNoteId(noteId)) {
      throw new Error("Invalid note id");
    }
    if (typeof content !== "string") {
      throw new Error("Invalid content");
    }
    setNoteContentInStore(noteId, content);
    persistNotes();
  },
);

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
  async (_event, type: string, note: Note) => {
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

ipcMain.handle(IPC_CHANNELS.GET_PLUGIN_LOAD_ISSUES, async () => {
  return getPluginLoader().getPluginLoadIssues();
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_LIST_WORKSPACE_FOLDERS, async () => {
  return getPluginLoader().listPluginWorkspaceFolders();
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_LOAD_NODEX_FROM_PARENT, async () => {
  const result = await showOpenDialogWithParent({
    properties: ["openDirectory"],
    title:
      "Parent folder — immediate subfolders containing .nodexplugin are registered",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, cancelled: true, added: [], warnings: [], errors: [] };
  }
  const scan = getPluginLoader().loadNodexPluginsFromParentDir(result.filePaths[0]);
  return { success: true, ...scan };
});

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_REMOVE_EXTERNAL_PLUGIN,
  async (_event, pluginId: string) => {
    if (!isSafePluginName(pluginId)) {
      return { success: false, error: "Invalid plugin id" };
    }
    const ok = getPluginLoader().removeExternalPluginWorkspace(pluginId);
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
      getPluginLoader().renamePluginSourcePath(
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
      getPluginLoader().copyPluginSourceWithinWorkspace(
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
  IPC_CHANNELS.PLUGIN_COPY_SOURCE_BETWEEN_WORKSPACES,
  async (
    _event,
    fromPlugin: string,
    fromRelative: string,
    toPlugin: string,
    toRelative: string,
  ) => {
    if (!isSafePluginName(fromPlugin) || !isSafePluginName(toPlugin)) {
      return { success: false, error: "Invalid plugin name" };
    }
    if (typeof fromRelative !== "string" || typeof toRelative !== "string") {
      return { success: false, error: "Invalid path" };
    }
    try {
      getPluginLoader().copyPluginSourceBetweenWorkspaces(
        fromPlugin,
        fromRelative,
        toPlugin,
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
  IPC_CHANNELS.PLUGIN_MOVE_SOURCE_BETWEEN_WORKSPACES,
  async (
    _event,
    fromPlugin: string,
    fromRelative: string,
    toPlugin: string,
    toRelative: string,
  ) => {
    if (!isSafePluginName(fromPlugin) || !isSafePluginName(toPlugin)) {
      return { success: false, error: "Invalid plugin name" };
    }
    if (typeof fromRelative !== "string" || typeof toRelative !== "string") {
      return { success: false, error: "Invalid path" };
    }
    try {
      getPluginLoader().movePluginSourceBetweenWorkspaces(
        fromPlugin,
        fromRelative,
        toPlugin,
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
    return getPluginLoader().getPluginSourceEntryKind(
      installedFolderName,
      relativePath,
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_GET_SOURCE_FILE_META,
  async (_event, installedFolderName: string, relativePath: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return null;
    }
    if (typeof relativePath !== "string") {
      return null;
    }
    return getPluginLoader().getPluginSourceFileMeta(
      installedFolderName,
      relativePath,
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_OPEN_WORKSPACE_IN_EDITOR,
  async (
    _event,
    payload: { editor: string; customBin?: string; pluginName: string },
  ) => {
    if (
      !payload ||
      typeof payload.pluginName !== "string" ||
      !isSafePluginName(payload.pluginName)
    ) {
      return { success: false as const, error: "Invalid plugin" };
    }
    const root = getPluginLoader().getPluginWorkspaceAbsolutePath(
      payload.pluginName,
    );
    if (!root || !fs.existsSync(root)) {
      return { success: false as const, error: "Workspace path not found" };
    }
    let cmd: string;
    switch (payload.editor) {
      case "vscode":
        cmd = "code";
        break;
      case "cursor":
        cmd = "cursor";
        break;
      case "windsurf":
        cmd = "windsurf";
        break;
      case "anigravity":
        cmd = "antigravity";
        break;
      case "custom":
        if (!payload.customBin?.trim()) {
          return {
            success: false as const,
            error: "Custom command required",
          };
        }
        cmd = payload.customBin.trim();
        break;
      default:
        return { success: false as const, error: "Unknown editor" };
    }
    try {
      const child = spawn(cmd, ["."], {
        cwd: root,
        shell: true,
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return { success: true as const };
    } catch (e) {
      return {
        success: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_REVEAL_WORKSPACE,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false as const, error: "Invalid plugin" };
    }
    const root = getPluginLoader().getPluginWorkspaceAbsolutePath(pluginName);
    if (!root || !fs.existsSync(root)) {
      return { success: false as const, error: "Workspace path not found" };
    }
    const err = await shell.openPath(root);
    if (err) {
      return { success: false as const, error: err };
    }
    return { success: true as const };
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_SCAFFOLD_PLUGIN_WORKSPACE,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false as const, error: "Invalid plugin name" };
    }
    try {
      return getPluginLoader().scaffoldPluginWorkspace(pluginName);
    } catch (e) {
      return {
        success: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_COPY_DIST_TO_FOLDER,
  async (_event, installedFolderName: string) => {
    if (!isSafePluginName(installedFolderName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const pick = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Copy dist/ contents into this folder",
    });
    if (pick.canceled || pick.filePaths.length === 0) {
      return { success: false, error: "Cancelled" };
    }
    return getPluginLoader().copyPluginDistContentsToDirectory(
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
    return getPluginLoader().listPluginSourceFiles(installedFolderName);
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_READ_SOURCE_FILE,
  async (_event, installedFolderName: string, relativePath: string) => {
    if (!isSafePluginName(installedFolderName)) {
      throw new Error("Invalid plugin name");
    }
    return getPluginLoader().readPluginSourceFile(
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
      getPluginLoader().writePluginSourceFile(
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
      getPluginLoader().mkdirPluginSourceDir(installedFolderName, relativeDir);
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
      getPluginLoader().createPluginSourceFile(
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
      getPluginLoader().deletePluginSourcePath(installedFolderName, relativePath);
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
  const result = await showOpenDialogWithParent({
    properties: ["openFile", "multiSelections"],
    title: "Import files into plugin workspace",
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths;
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_DIRECTORY, async () => {
  const result = await showOpenDialogWithParent({
    properties: ["openDirectory"],
    title: "Choose folder (plugin root or folder to merge into current plugin)",
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
    return getPluginLoader().importExternalFilesIntoWorkspace(
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
    return getPluginLoader().importExternalDirectoryIntoWorkspace(
      installedFolderName,
      absoluteDir,
      typeof destRelativeBase === "string" ? destRelativeBase : "",
    );
  },
);

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IMPORT_DIRECTORY_AS_NEW_WORKSPACE,
  async (_event, absoluteDir: unknown) => {
    if (typeof absoluteDir !== "string") {
      return { success: false, error: "Invalid directory" };
    }
    try {
      return getPluginLoader().importDirectoryAsNewWorkspace(absoluteDir);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
);

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
    return getPluginLoader().runTypecheckOnPluginWorkspace(pluginName);
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
  const nodexSdk = resolveNodexPluginUiMonacoLib();
  if (nodexSdk) {
    libs.push(nodexSdk);
  }
  return { libs };
});

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IDE_PLUGIN_TYPINGS,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return null;
    }
    return getPluginLoader().getIdePluginVirtualTypings(pluginName);
  },
);

ipcMain.handle(IPC_CHANNELS.PLUGIN_RELOAD_REGISTRY, async () => {
  try {
    getPluginLoader().reload(registry);
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_USER_PLUGINS_DIR, () => {
  try {
    return { path: getNodexUserPluginsDir(app.getPath("userData")) };
  } catch (e) {
    return {
      path: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_RESET_USER_DATA_PLUGINS, async () => {
  const pathResult: { success: boolean; path: string; error?: string } = {
    success: false,
    path: "",
  };
  try {
    const pluginsPath = getNodexUserPluginsDir(app.getPath("userData"));
    pathResult.path = pluginsPath;
    if (fs.existsSync(pluginsPath)) {
      fs.rmSync(pluginsPath, { recursive: true, force: true });
    }
    fs.mkdirSync(pluginsPath, { recursive: true });
    seedSamplePluginsToUserDir(pluginsPath);
    setIdeWorkspaceWatch(null);
    getPluginLoader().reload(registry);
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
    }
    pathResult.success = true;
    return pathResult;
  } catch (e) {
    pathResult.error = e instanceof Error ? e.message : String(e);
    return pathResult;
  }
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_MAINT_DELETE_BIN_AND_CACHES, async () => {
  try {
    getPluginLoader().clearBinAndPluginCaches(registry);
    setIdeWorkspaceWatch(null);
    broadcastPluginsChanged();
    return { success: true as const };
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_MAINT_FORMAT_NODEX, async () => {
  try {
    getPluginLoader().formatNodexPluginData(registry);
    setIdeWorkspaceWatch(null);
    broadcastPluginsChanged();
    return { success: true as const };
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.PLUGIN_MAINT_DELETE_SOURCES, async () => {
  try {
    getPluginLoader().deleteAllPluginSources(registry);
    setIdeWorkspaceWatch(null);
    broadcastPluginsChanged();
    return { success: true as const };
  } catch (e) {
    return {
      success: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
});

ipcMain.handle(IPC_CHANNELS.GET_INSTALLED_PLUGINS, async () => {
  return getPluginLoader().getLoadedPlugins();
});

ipcMain.handle(
  IPC_CHANNELS.UNINSTALL_PLUGIN,
  async (_event, pluginName: string) => {
    if (!isSafePluginName(pluginName)) {
      return { success: false, error: "Invalid plugin name" };
    }
    const userDataPath = app.getPath("userData");
    try {
      getPluginLoader().uninstallPlugin(pluginName, registry);
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
}

