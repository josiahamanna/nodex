import { spawn } from "child_process";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  protocol,
  session,
  shell,
} from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { appendPluginAudit } from "./core/plugin-audit";
import { pluginCacheManager } from "./core/plugin-cache-manager";
import { PluginLoader } from "./core/plugin-loader";
import { seedSamplePluginsToUserDir } from "./core/seed-user-plugins";
import { resolveNodexPluginUiMonacoLib } from "./core/resolve-nodex-plugin-ui";
import { setPluginProgressSink } from "./core/plugin-progress";
import { packageManager } from "./core/package-manager";
import { initJsxCompilerCache } from "./core/jsx-compiler";
import {
  listProjectAssets,
  moveProjectAsset,
  resolveAssetFilePath,
} from "./core/assets-fs";
import {
  clearNodexUndoRedo,
  nodexRedo,
  nodexUndo,
  pushNotesUndoSnapshot,
  recordAssetMoveForUndo,
} from "./core/nodex-undo";
import {
  getNodexJsxCacheRoot,
  getNodexPluginCacheRoot,
  getNodexUserPluginsDir,
} from "./core/nodex-paths";
import { readAppPrefs, writeAppPrefs } from "./core/app-prefs";
import { saveNotesState } from "./core/notes-persistence";
import {
  activateProject,
  activateWorkspace,
  deactivateProject,
  getNormalizedWorkspaceRoots,
  readProjectPrefs,
} from "./core/project-session";
import {
  createNote as createNoteInStore,
  deleteNoteSubtrees,
  duplicateSubtreeAt,
  ensureNotesSeeded,
  getFirstNote,
  setSeedSampleNotesPreference,
  getNoteById,
  getNotesFlat,
  moveNote as moveNoteInStore,
  moveNotesBulk as moveNotesBulkInStore,
  renameNote as renameNoteInStore,
  setNoteContent as setNoteContentInStore,
  setNotePluginUiState,
} from "./core/notes-store";
import { registry } from "./core/registry";
import {
  clearMainDebugLogBuffer,
  getMainDebugLogBuffer,
  ingestRendererStructuredLog,
  installMainProcessDebugLogTap,
  setMainDebugLogWindow,
} from "./main/main-process-debug-log";
import type { ClientLogPayload } from "./shared/client-log";
import { IPC_CHANNELS } from "./shared/ipc-channels";
import { toFileUri } from "./shared/file-uri";
import {
  isSafePluginName,
  isValidNoteId,
  isValidNoteType,
} from "./shared/validators";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "nodex-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainWindow: BrowserWindow | null = null;
let pluginLoader: PluginLoader;
let notesPersistencePath: string | null = null;
/** Opened Nodex project directory (contains `data/` and `assets/`). */
let projectRootPath: string | null = null;
/** All workspace folders (merged notes); first entry matches `projectRootPath`. */
let workspaceRoots: string[] = [];

function assetsRootForIpc(projectRootOpt: string | undefined): string | null {
  if (projectRootOpt != null && projectRootOpt.length > 0) {
    const abs = path.resolve(projectRootOpt);
    for (const r of workspaceRoots) {
      if (path.resolve(r) === abs) {
        return abs;
      }
    }
    return null;
  }
  return projectRootPath;
}

function parseAssetIpcPayload(payload: unknown): {
  rel: string;
  projectRoot?: string;
} {
  if (typeof payload === "string") {
    return { rel: payload };
  }
  if (payload && typeof payload === "object") {
    const o = payload as Record<string, unknown>;
    const rel =
      typeof o.relativePath === "string"
        ? o.relativePath
        : typeof o.rel === "string"
          ? o.rel
          : "";
    const projectRoot =
      typeof o.projectRoot === "string" ? o.projectRoot : undefined;
    return { rel, projectRoot };
  }
  return { rel: "" };
}

function broadcastProjectRootChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.PROJECT_ROOT_CHANGED);
  }
}

function registerNodexAssetProtocol(): void {
  session.defaultSession.protocol.registerFileProtocol(
    "nodex-asset",
    (request, callback) => {
      try {
        const u = new URL(request.url);
        const rootParam = u.searchParams.get("root");
        let baseRoot: string | null = null;
        if (rootParam) {
          try {
            const abs = path.resolve(decodeURIComponent(rootParam));
            for (const r of workspaceRoots) {
              if (path.resolve(r) === abs) {
                baseRoot = abs;
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
        if (!baseRoot) {
          baseRoot = projectRootPath;
        }
        if (!baseRoot) {
          callback({ error: -2 });
          return;
        }
        let rel = decodeURIComponent(
          (u.pathname || "").replace(/^\/+/, ""),
        ).replace(/\\/g, "/");
        if (!rel || rel.includes("..")) {
          callback({ error: -2 });
          return;
        }
        const segments = rel.split("/").filter(Boolean);
        for (const s of segments) {
          if (s.startsWith(".") || s === "..") {
            callback({ error: -2 });
            return;
          }
        }
        const assetsRoot = path.resolve(path.join(baseRoot, "assets"));
        const full = path.resolve(path.join(assetsRoot, ...segments));
        if (!full.startsWith(assetsRoot + path.sep) && full !== assetsRoot) {
          callback({ error: -2 });
          return;
        }
        callback({ path: full });
      } catch {
        callback({ error: -2 });
      }
    },
  );
}

function applyWorkspaceActivateResult(res: {
  ok: true;
  root: string;
  dbPath: string;
  workspaceRoots: string[];
}): void {
  if (res.workspaceRoots.length === 0) {
    projectRootPath = null;
    notesPersistencePath = null;
    workspaceRoots = [];
    return;
  }
  projectRootPath = res.root;
  notesPersistencePath = res.dbPath;
  workspaceRoots = res.workspaceRoots;
}

function tryLoadSavedProject(
  userDataPath: string,
  registeredTypes: string[],
): void {
  const prefs = readProjectPrefs(userDataPath);
  const roots = getNormalizedWorkspaceRoots(prefs);
  if (roots.length === 0) {
    projectRootPath = null;
    notesPersistencePath = null;
    workspaceRoots = [];
    clearNodexUndoRedo();
    deactivateProject();
    return;
  }
  const r = activateWorkspace(roots, userDataPath, registeredTypes);
  if (r.ok) {
    applyWorkspaceActivateResult(r);
    clearNodexUndoRedo();
    if (workspaceRoots.length > 0) {
      console.log("[Main] Opened workspace:", workspaceRoots.join(", "));
    }
    return;
  }
  console.warn("[Main] Could not open saved project:", r.error);
  projectRootPath = null;
  notesPersistencePath = null;
  workspaceRoots = [];
  clearNodexUndoRedo();
  deactivateProject();
}

function persistNotes(): void {
  if (!notesPersistencePath) {
    return;
  }
  try {
    saveNotesState();
  } catch (e) {
    console.warn("[Main] Failed to save notes:", e);
  }
}

function assertProjectOpenForNotes(): void {
  if (!projectRootPath) {
    throw new Error("Open a project folder first (Notes → Open project).");
  }
}

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

/** Avoid passing `undefined` as the first argument to `showOpenDialog` (can break on some platforms). */
function showOpenDialogWithParent(
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  const parent = getDialogParent();
  return parent
    ? dialog.showOpenDialog(parent, options)
    : dialog.showOpenDialog(options);
}

function broadcastNativeThemeToRenderers(): void {
  const dark = nativeTheme.shouldUseDarkColors;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UI_NATIVE_THEME_CHANGED, dark);
    }
  }
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
    /** No in-window menu; Linux/Windows use `removeMenu()` below. */
    autoHideMenuBar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (process.platform !== "darwin") {
    mainWindow.removeMenu();
  }
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (process.env.NODE_ENV === "development") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) {
      return;
    }
    const primary = input.control || input.meta;
    if (!primary || input.alt || input.shift) {
      return;
    }
    if (input.key.toLowerCase() !== "r") {
      return;
    }
    event.preventDefault();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }
    mainWindow.webContents.reload();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

app.on("ready", () => {
  Menu.setApplicationMenu(null);
  installMainProcessDebugLogTap();
  setMainDebugLogWindow(() => mainWindow);

  ipcMain.removeHandler(IPC_CHANNELS.PLUGIN_IDE_GET_MAIN_DEBUG_LOGS);
  ipcMain.removeHandler(IPC_CHANNELS.PLUGIN_IDE_CLEAR_MAIN_DEBUG_LOGS);
  ipcMain.handle(IPC_CHANNELS.PLUGIN_IDE_GET_MAIN_DEBUG_LOGS, () =>
    getMainDebugLogBuffer(),
  );
  ipcMain.handle(IPC_CHANNELS.PLUGIN_IDE_CLEAR_MAIN_DEBUG_LOGS, () => {
    clearMainDebugLogBuffer();
    return { success: true as const };
  });

  ipcMain.removeAllListeners(IPC_CHANNELS.NODEX_CLIENT_LOG);
  ipcMain.on(IPC_CHANNELS.NODEX_CLIENT_LOG, (_event, raw: unknown) => {
    const p = raw as Partial<ClientLogPayload>;
    if (typeof p.component !== "string" || typeof p.message !== "string") {
      return;
    }
    const lv = p.level;
    const level: ClientLogPayload["level"] =
      lv === "info" || lv === "warn" || lv === "error" || lv === "debug" || lv === "log"
        ? lv
        : "log";
    ingestRendererStructuredLog({
      level,
      component: p.component.slice(0, 120),
      message: p.message.slice(0, 12_000),
      noteId: typeof p.noteId === "string" ? p.noteId.slice(0, 200) : undefined,
      noteTitle:
        typeof p.noteTitle === "string" ? p.noteTitle.slice(0, 500) : undefined,
    });
  });

  nativeTheme.on("updated", broadcastNativeThemeToRenderers);

  ipcMain.handle(IPC_CHANNELS.UI_GET_NATIVE_THEME_DARK, () => {
    return nativeTheme.shouldUseDarkColors;
  });

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

  const userDataPath = app.getPath("userData");
  pluginCacheManager.setRoot(getNodexPluginCacheRoot(userDataPath));
  pluginCacheManager.ensureRoot();
  initJsxCompilerCache(getNodexJsxCacheRoot(userDataPath));

  const pluginsPath = getNodexUserPluginsDir(userDataPath);
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
  pluginLoader.setUserDataPathForDisabled(userDataPath);

  ipcMain.handle(IPC_CHANNELS.UI_TOGGLE_DEVTOOLS, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.toggleDevTools();
    }
    return { success: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_DISABLED_IDS, () =>
    pluginLoader.getDisabledUserPluginIdsForIpc(),
  );

  ipcMain.handle(
    IPC_CHANNELS.PLUGIN_SET_ENABLED,
    (_e, payload: unknown) => {
      if (
        !payload ||
        typeof payload !== "object" ||
        typeof (payload as { pluginId?: unknown }).pluginId !== "string" ||
        typeof (payload as { enabled?: unknown }).enabled !== "boolean"
      ) {
        return { success: false as const, error: "Invalid payload" };
      }
      const { pluginId, enabled } = payload as {
        pluginId: string;
        enabled: boolean;
      };
      if (!isSafePluginName(pluginId)) {
        return { success: false as const, error: "Invalid plugin id" };
      }
      try {
        pluginLoader.setUserPluginEnabled(pluginId, enabled);
        pluginLoader.reload(registry);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
        }
        return { success: true as const };
      } catch (err) {
        return {
          success: false as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_INVENTORY, () =>
    pluginLoader.getPluginInventory(),
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_PLUGIN_RENDERER_UI_META,
    (_e, noteType: string) => {
      if (!isValidNoteType(noteType)) {
        return null;
      }
      const r = registry.getRenderer(noteType);
      if (!r) {
        return null;
      }
      return {
        theme: r.theme ?? "inherit",
        designSystemVersion: r.designSystemVersion,
        deferDisplayUntilContentReady:
          r.deferDisplayUntilContentReady === true,
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.GET_PLUGIN_MANIFEST_UI, (_e, name: string) => {
    if (typeof name !== "string" || name.trim().length === 0) {
      return null;
    }
    return pluginLoader.getManifestUiFields(name.trim());
  });

  pluginLoader.loadAll(registry);

  setSeedSampleNotesPreference(readAppPrefs(userDataPath).seedSampleNotes);

  registerNodexAssetProtocol();
  tryLoadSavedProject(userDataPath, registry.getRegisteredTypes());
  if (projectRootPath) {
    console.log("[Main] Notes database:", notesPersistencePath);
  } else {
    console.log("[Main] No project open — use Open project to choose a folder.");
  }

  ipcMain.removeHandler(IPC_CHANNELS.MOVE_NOTE);
  ipcMain.removeHandler(IPC_CHANNELS.MOVE_NOTES_BULK);
  ipcMain.removeHandler(IPC_CHANNELS.DELETE_NOTES);
  ipcMain.removeHandler(IPC_CHANNELS.PASTE_SUBTREE);
  ipcMain.handle(
    IPC_CHANNELS.DELETE_NOTES,
    async (_event, ids: unknown) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("Invalid ids");
      }
      for (const id of ids) {
        if (typeof id !== "string" || !isValidNoteId(id)) {
          throw new Error("Invalid note id");
        }
      }
      pushNotesUndoSnapshot();
      deleteNoteSubtrees(ids as string[]);
      persistNotes();
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MOVE_NOTES_BULK,
    async (
      _event,
      payload: { ids: string[]; targetId: string; placement: string },
    ) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { ids, targetId } = payload;
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error("Invalid ids");
      }
      for (const id of ids) {
        if (typeof id !== "string" || !isValidNoteId(id)) {
          throw new Error("Invalid note id");
        }
      }
      if (typeof targetId !== "string" || !isValidNoteId(targetId)) {
        throw new Error("Invalid target id");
      }
      const p = payload.placement;
      if (p !== "before" && p !== "after" && p !== "into") {
        throw new Error("Invalid placement");
      }
      pushNotesUndoSnapshot();
      moveNotesBulkInStore(ids as string[], targetId, p);
      persistNotes();
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.MOVE_NOTE,
    async (
      _event,
      payload: { draggedId: string; targetId: string; placement: string },
    ) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);

      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { draggedId, targetId } = payload;
      if (!isValidNoteId(draggedId) || !isValidNoteId(targetId)) {
        throw new Error("Invalid id");
      }
      const p = payload.placement;
      if (p !== "before" && p !== "after" && p !== "into") {
        throw new Error("Invalid placement");
      }
      pushNotesUndoSnapshot();
      moveNoteInStore(draggedId, targetId, p);
      persistNotes();
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.PASTE_SUBTREE,
    async (
      _event,
      payload: {
        sourceId: string;
        targetId: string;
        mode: string;
        placement: string;
      },
    ) => {
      assertProjectOpenForNotes();
      const registeredTypes = registry.getRegisteredTypes();
      ensureNotesSeeded(registeredTypes);

      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid payload");
      }
      const { sourceId, targetId, mode, placement } = payload;
      if (!isValidNoteId(sourceId) || !isValidNoteId(targetId)) {
        throw new Error("Invalid id");
      }
      if (mode !== "cut" && mode !== "copy") {
        throw new Error("Invalid mode");
      }
      if (
        placement !== "before" &&
        placement !== "after" &&
        placement !== "into"
      ) {
        throw new Error("Invalid placement");
      }
      if (mode === "cut") {
        pushNotesUndoSnapshot();
        moveNoteInStore(sourceId, targetId, placement);
        persistNotes();
        return {};
      }
      pushNotesUndoSnapshot();
      const { newRootId } = duplicateSubtreeAt(sourceId, targetId, placement);
      persistNotes();
      return { newRootId };
    },
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_GET_STATE, () => ({
    rootPath: projectRootPath,
    notesDbPath: notesPersistencePath,
    workspaceRoots: [...workspaceRoots],
  }));

  ipcMain.handle(IPC_CHANNELS.APP_GET_PREFS, () => readAppPrefs(userDataPath));

  ipcMain.handle(
    IPC_CHANNELS.APP_SET_SEED_SAMPLE_NOTES,
    (_e, enabled: unknown) => {
      if (typeof enabled !== "boolean") {
        return { ok: false as const, error: "Invalid value" };
      }
      const next = writeAppPrefs(userDataPath, { seedSampleNotes: enabled });
      setSeedSampleNotesPreference(next.seedSampleNotes);
      return { ok: true as const, seedSampleNotes: next.seedSampleNotes };
    },
  );

  ipcMain.handle(IPC_CHANNELS.PROJECT_SELECT_FOLDER, async () => {
    const r = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Open Nodex project folder",
    });
    if (r.canceled || r.filePaths.length === 0) {
      return { ok: false as const, cancelled: true as const };
    }
    const chosen = r.filePaths[0]!;
    const res = activateProject(
      chosen,
      userDataPath,
      registry.getRegisteredTypes(),
    );
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    clearNodexUndoRedo();
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: projectRootPath,
      workspaceRoots: [...workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_ADD_WORKSPACE_FOLDER, async () => {
    if (!projectRootPath || workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "Open a project folder first (Notes → Open project).",
      };
    }
    const r = await showOpenDialogWithParent({
      properties: ["openDirectory", "createDirectory"],
      title: "Add another project folder to the workspace",
    });
    if (r.canceled || r.filePaths.length === 0) {
      return { ok: false as const, cancelled: true as const };
    }
    const chosen = path.resolve(r.filePaths[0]!);
    if (workspaceRoots.includes(chosen)) {
      return {
        ok: false as const,
        error: "That folder is already in the workspace.",
      };
    }
    const next = [...workspaceRoots, chosen];
    const res = activateWorkspace(next, userDataPath, registry.getRegisteredTypes());
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: projectRootPath,
      workspaceRoots: [...workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_OPEN_PATH, async (_e, absPath: unknown) => {
    if (typeof absPath !== "string" || absPath.length === 0) {
      return { ok: false as const, error: "Invalid path" };
    }
    const res = activateProject(
      absPath,
      userDataPath,
      registry.getRegisteredTypes(),
    );
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    clearNodexUndoRedo();
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: projectRootPath,
      workspaceRoots: [...workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_REVEAL_FOLDER, async (_e, folderPath: unknown) => {
    if (typeof folderPath !== "string" || folderPath.length === 0) {
      return { ok: false as const, error: "Invalid path" };
    }
    const abs = path.resolve(folderPath);
    const allowed = workspaceRoots.some((r) => path.resolve(r) === abs);
    if (!allowed) {
      return {
        ok: false as const,
        error: "Path is not an open project folder",
      };
    }
    const err = await shell.openPath(abs);
    if (err) {
      return { ok: false as const, error: err };
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_REFRESH_WORKSPACE, () => {
    if (workspaceRoots.length === 0) {
      return { ok: false as const, error: "No workspace open" };
    }
    const res = activateWorkspace(
      [...workspaceRoots],
      userDataPath,
      registry.getRegisteredTypes(),
    );
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    clearNodexUndoRedo();
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: projectRootPath,
      workspaceRoots: [...workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_LIST, (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return {
        ok: false as const,
        error: prOpt
          ? "Unknown project folder for assets"
          : "No project open",
      };
    }
    return listProjectAssets(root, rel);
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_GET_INFO, (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    if (typeof rel !== "string" || rel.length === 0) {
      return null;
    }
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return null;
    }
    const full = resolveAssetFilePath(root, rel);
    if (!full) {
      return null;
    }
    try {
      const st = fs.statSync(full);
      const base = path.basename(full);
      const ext = path.extname(base).slice(1).toLowerCase();
      return {
        name: base,
        ext,
        size: st.size,
        relativePath: rel.replace(/\\/g, "/"),
      };
    } catch {
      return null;
    }
  });

  const MAX_ASSET_TEXT = 2_000_000;
  ipcMain.handle(IPC_CHANNELS.ASSET_READ_TEXT, (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    if (typeof rel !== "string" || rel.length === 0) {
      return { ok: false as const, error: "Invalid request" };
    }
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return { ok: false as const, error: "No project open" };
    }
    const full = resolveAssetFilePath(root, rel);
    if (!full) {
      return { ok: false as const, error: "Not found" };
    }
    try {
      const st = fs.statSync(full);
      if (st.size > MAX_ASSET_TEXT) {
        return { ok: false as const, error: "File too large for text preview" };
      }
      const text = fs.readFileSync(full, "utf8");
      return { ok: true as const, text };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_OPEN_EXTERNAL, async (_e, payload: unknown) => {
    const { rel, projectRoot: prOpt } = parseAssetIpcPayload(payload);
    if (typeof rel !== "string" || rel.length === 0) {
      return { ok: false as const, error: "Invalid request" };
    }
    const root = assetsRootForIpc(prOpt);
    if (!root) {
      return { ok: false as const, error: "No project open" };
    }
    const full = resolveAssetFilePath(root, rel);
    if (!full) {
      return { ok: false as const, error: "Not found" };
    }
    const err = await shell.openPath(full);
    if (err) {
      return { ok: false as const, error: err };
    }
    return { ok: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.ASSET_MOVE, (_e, payload: unknown) => {
    if (!payload || typeof payload !== "object") {
      return { ok: false as const, error: "Invalid payload" };
    }
    const o = payload as Record<string, unknown>;
    const fromProject =
      typeof o.fromProject === "string" ? o.fromProject : "";
    const fromRel = typeof o.fromRel === "string" ? o.fromRel : "";
    const toProject = typeof o.toProject === "string" ? o.toProject : "";
    const toDirRel = typeof o.toDirRel === "string" ? o.toDirRel : "";
    if (!fromProject || !fromRel || !toProject) {
      return { ok: false as const, error: "Invalid paths" };
    }
    const roots = workspaceRoots.map((w) => path.resolve(w));
    const moved = moveProjectAsset(roots, fromProject, fromRel, toProject, toDirRel);
    if (!moved.ok) {
      return { ok: false as const, error: moved.error };
    }
    recordAssetMoveForUndo({
      fromProject,
      fromRel,
      toProject,
      toRel: moved.toRel,
    });
    return { ok: true as const, toRel: moved.toRel };
  });

  ipcMain.handle(IPC_CHANNELS.NODEX_UNDO, () => {
    if (!projectRootPath || workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      };
    }
    const r = nodexUndo(workspaceRoots.map((w) => path.resolve(w)));
    if (!r.ok) {
      return {
        ok: false as const,
        error: r.error ?? "Undo failed",
        touchedNotes: false,
      };
    }
    if (r.touchedNotes) {
      persistNotes();
    }
    return { ok: true as const, touchedNotes: r.touchedNotes === true };
  });

  ipcMain.handle(IPC_CHANNELS.NODEX_REDO, () => {
    if (!projectRootPath || workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      };
    }
    const r = nodexRedo(workspaceRoots.map((w) => path.resolve(w)));
    if (!r.ok) {
      return {
        ok: false as const,
        error: r.error ?? "Redo failed",
        touchedNotes: false,
      };
    }
    if (r.touchedNotes) {
      persistNotes();
    }
    return { ok: true as const, touchedNotes: r.touchedNotes === true };
  });

  createWindow();

  setPluginProgressSink((payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_PROGRESS, payload);
    }
  });
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
  if (!projectRootPath) {
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
  if (!projectRootPath) {
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
    const result = await showOpenDialogWithParent({
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
    const result = await showOpenDialogWithParent({
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
  const result = await showOpenDialogWithParent({
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
      pluginLoader.copyPluginSourceBetweenWorkspaces(
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
      pluginLoader.movePluginSourceBetweenWorkspaces(
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
    return pluginLoader.getPluginSourceEntryKind(
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
    return pluginLoader.getPluginSourceFileMeta(
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
    const root = pluginLoader.getPluginWorkspaceAbsolutePath(
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
    const root = pluginLoader.getPluginWorkspaceAbsolutePath(pluginName);
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
      return pluginLoader.scaffoldPluginWorkspace(pluginName);
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

ipcMain.handle(
  IPC_CHANNELS.PLUGIN_IMPORT_DIRECTORY_AS_NEW_WORKSPACE,
  async (_event, absoluteDir: unknown) => {
    if (typeof absoluteDir !== "string") {
      return { success: false, error: "Invalid directory" };
    }
    try {
      return pluginLoader.importDirectoryAsNewWorkspace(absoluteDir);
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
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
    pluginLoader.reload(registry);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
    }
    pathResult.success = true;
    return pathResult;
  } catch (e) {
    pathResult.error = e instanceof Error ? e.message : String(e);
    return pathResult;
  }
});

function broadcastPluginsChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
  }
}

ipcMain.handle(IPC_CHANNELS.PLUGIN_MAINT_DELETE_BIN_AND_CACHES, async () => {
  try {
    pluginLoader.clearBinAndPluginCaches(registry);
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
    pluginLoader.formatNodexPluginData(registry);
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
    pluginLoader.deleteAllPluginSources(registry);
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
