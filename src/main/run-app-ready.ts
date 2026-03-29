import { app, ipcMain, Menu, nativeTheme, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { pluginCacheManager } from "../core/plugin-cache-manager";
import { PluginLoader } from "../core/plugin-loader";
import { seedSamplePluginsToUserDir } from "../core/seed-user-plugins";
import { setPluginProgressSink } from "../core/plugin-progress";
import { initJsxCompilerCache } from "../core/jsx-compiler";
import {
  listProjectAssets,
  moveProjectAsset,
  resolveAssetFilePath,
} from "../core/assets-fs";
import {
  clearNodexUndoRedo,
  nodexRedo,
  nodexUndo,
  pushNotesUndoSnapshot,
  recordAssetMoveForUndo,
} from "../core/nodex-undo";
import {
  getNodexJsxCacheRoot,
  getNodexPluginCacheRoot,
  getNodexUserPluginsDir,
} from "../core/nodex-paths";
import { readAppPrefs, writeAppPrefs } from "../core/app-prefs";
import {
  activateProject,
  activateWorkspace,
  closeWorkspace,
} from "../core/project-session";
import {
  deleteNoteSubtrees,
  duplicateSubtreeAt,
  ensureNotesSeeded,
  moveNote as moveNoteInStore,
  moveNotesBulk as moveNotesBulkInStore,
  setSeedSampleNotesPreference,
} from "../core/notes-store";
import { registry } from "../core/registry";
import {
  clearMainDebugLogBuffer,
  getMainDebugLogBuffer,
  ingestRendererStructuredLog,
  installMainProcessDebugLogTap,
  setMainDebugLogWindow,
} from "./main-process-debug-log";
import type { ClientLogPayload } from "../shared/client-log";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { isWorkspaceMountNoteId } from "../shared/note-workspace";
import {
  isSafePluginName,
  isValidNoteId,
  isValidNoteType,
} from "../shared/validators";
import { ctx, getPluginLoader } from "./main-context";
import { createMainWindow } from "./create-main-window";
import {
  applyWorkspaceActivateResult,
  assertProjectOpenForNotes,
  assetsRootForIpc,
  broadcastNativeThemeToRenderers,
  broadcastProjectRootChanged,
  parseAssetIpcPayload,
  persistNotes,
  registerNodexAssetProtocol,
  resolveBundledCorePluginsDir,
  showOpenDialogWithParent,
  tryLoadSavedProject,
} from "./main-helpers";

export function runAppReady(): void {
  Menu.setApplicationMenu(null);
  installMainProcessDebugLogTap();
  setMainDebugLogWindow(() => ctx.mainWindow);

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

  ctx.pluginLoader = new PluginLoader(pluginsPath, bundledRoots);
  getPluginLoader().setUserDataPathForDisabled(userDataPath);

  ipcMain.handle(IPC_CHANNELS.UI_TOGGLE_DEVTOOLS, () => {
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow.webContents.toggleDevTools();
    }
    return { success: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.UI_QUIT_APP, () => {
    app.quit();
    return { success: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.UI_RELOAD_WINDOW, () => {
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow.webContents.reload();
    }
    return { success: true as const };
  });

  ipcMain.handle(IPC_CHANNELS.PLUGIN_GET_DISABLED_IDS, () =>
    getPluginLoader().getDisabledUserPluginIdsForIpc(),
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
        getPluginLoader().setUserPluginEnabled(pluginId, enabled);
        getPluginLoader().reload(registry);
        if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
          ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
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
    getPluginLoader().getPluginInventory(),
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
    return getPluginLoader().getManifestUiFields(name.trim());
  });

  getPluginLoader().loadAll(registry);

  setSeedSampleNotesPreference(readAppPrefs(userDataPath).seedSampleNotes);

  registerNodexAssetProtocol();
  tryLoadSavedProject(userDataPath, registry.getRegisteredTypes());
  if (ctx.projectRootPath) {
    console.log("[Main] Notes database:", ctx.notesPersistencePath);
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
      const deletable = (ids as string[]).filter(
        (id) => !isWorkspaceMountNoteId(id),
      );
      if (deletable.length === 0) {
        return;
      }
      pushNotesUndoSnapshot();
      deleteNoteSubtrees(deletable);
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
    rootPath: ctx.projectRootPath,
    notesDbPath: ctx.notesPersistencePath,
    workspaceRoots: [...ctx.workspaceRoots],
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
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_ADD_WORKSPACE_FOLDER, async () => {
    if (!ctx.projectRootPath || ctx.workspaceRoots.length === 0) {
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
    if (ctx.workspaceRoots.includes(chosen)) {
      return {
        ok: false as const,
        error: "That folder is already in the workspace.",
      };
    }
    const next = [...ctx.workspaceRoots, chosen];
    const res = activateWorkspace(next, userDataPath, registry.getRegisteredTypes());
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    applyWorkspaceActivateResult(res);
    broadcastProjectRootChanged();
    return {
      ok: true as const,
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
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
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(IPC_CHANNELS.PROJECT_REVEAL_FOLDER, async (_e, folderPath: unknown) => {
    if (typeof folderPath !== "string" || folderPath.length === 0) {
      return { ok: false as const, error: "Invalid path" };
    }
    const abs = path.resolve(folderPath);
    const allowed = ctx.workspaceRoots.some((r) => path.resolve(r) === abs);
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
    if (ctx.workspaceRoots.length === 0) {
      return { ok: false as const, error: "No workspace open" };
    }
    const res = activateWorkspace(
      [...ctx.workspaceRoots],
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
      rootPath: ctx.projectRootPath,
      workspaceRoots: [...ctx.workspaceRoots],
    };
  });

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_REMOVE_WORKSPACE_ROOT,
    async (_e, payload: unknown) => {
      if (!payload || typeof payload !== "object") {
        return { ok: false as const, error: "Invalid payload" };
      }
      const raw = payload as {
        projectRootAbs?: unknown;
        moveToTrash?: unknown;
      };
      if (
        typeof raw.projectRootAbs !== "string" ||
        raw.projectRootAbs.trim().length === 0
      ) {
        return { ok: false as const, error: "Invalid path" };
      }
      const abs = path.resolve(raw.projectRootAbs.trim());
      const moveToTrash = raw.moveToTrash === true;
      const idx = ctx.workspaceRoots.findIndex(
        (r) => path.resolve(r) === abs,
      );
      if (idx < 0) {
        return {
          ok: false as const,
          error: "That folder is not in the workspace",
        };
      }
      const next = ctx.workspaceRoots.filter((_, i) => i !== idx);
      const res =
        next.length === 0
          ? closeWorkspace(userDataPath)
          : activateWorkspace(
              next,
              userDataPath,
              registry.getRegisteredTypes(),
            );
      if (!res.ok) {
        return { ok: false as const, error: res.error };
      }
      applyWorkspaceActivateResult(res);
      clearNodexUndoRedo();
      broadcastProjectRootChanged();
      let trashError: string | undefined;
      if (moveToTrash) {
        try {
          await shell.trashItem(abs);
        } catch (e) {
          trashError = e instanceof Error ? e.message : String(e);
        }
      }
      return {
        ok: true as const,
        rootPath: ctx.projectRootPath,
        workspaceRoots: [...ctx.workspaceRoots],
        trashError,
      };
    },
  );

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
    const roots = ctx.workspaceRoots.map((w) => path.resolve(w));
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
    if (!ctx.projectRootPath || ctx.workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      };
    }
    const r = nodexUndo(ctx.workspaceRoots.map((w) => path.resolve(w)));
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
    if (!ctx.projectRootPath || ctx.workspaceRoots.length === 0) {
      return {
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      };
    }
    const r = nodexRedo(ctx.workspaceRoots.map((w) => path.resolve(w)));
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

  createMainWindow();

  setPluginProgressSink((payload) => {
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_PROGRESS, payload);
    }
  });}

