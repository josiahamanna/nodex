import { BrowserWindow, dialog, nativeTheme, session, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import {
  activateWorkspace,
  deactivateProject,
  getNormalizedWorkspaceRoots,
  readProjectPrefs,
} from "../core/project-session";
import { clearNodexUndoRedo } from "../core/nodex-undo";
import { saveNotesState } from "../core/notes-persistence";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { isSafePluginName } from "../shared/validators";
import { ctx, getPluginLoader } from "./main-context";
import { parseAssetIpcPayload } from "./parse-asset-ipc-payload";

export { parseAssetIpcPayload };

export function assetsRootForIpc(projectRootOpt: string | undefined): string | null {
  if (projectRootOpt != null && projectRootOpt.length > 0) {
    const abs = path.resolve(projectRootOpt);
    for (const r of ctx.workspaceRoots) {
      if (path.resolve(r) === abs) {
        return abs;
      }
    }
    return null;
  }
  return ctx.projectRootPath;
}

export function broadcastProjectRootChanged(): void {
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send(IPC_CHANNELS.PROJECT_ROOT_CHANGED);
  }
}

export function registerNodexAssetProtocol(): void {
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
            for (const r of ctx.workspaceRoots) {
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
          baseRoot = ctx.projectRootPath;
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

export function applyWorkspaceActivateResult(res: {
  ok: true;
  root: string;
  dbPath: string;
  workspaceRoots: string[];
}): void {
  if (res.workspaceRoots.length === 0) {
    ctx.projectRootPath = null;
    ctx.notesPersistencePath = null;
    ctx.workspaceRoots = [];
    return;
  }
  ctx.projectRootPath = res.root;
  ctx.notesPersistencePath = res.dbPath;
  ctx.workspaceRoots = res.workspaceRoots;
}

export function tryLoadSavedProject(
  userDataPath: string,
  registeredTypes: string[],
): void {
  const prefs = readProjectPrefs(userDataPath);
  const roots = getNormalizedWorkspaceRoots(prefs);
  if (roots.length === 0) {
    ctx.projectRootPath = null;
    ctx.notesPersistencePath = null;
    ctx.workspaceRoots = [];
    clearNodexUndoRedo();
    deactivateProject();
    return;
  }
  const r = activateWorkspace(roots, userDataPath, registeredTypes);
  if (r.ok) {
    applyWorkspaceActivateResult(r);
    clearNodexUndoRedo();
    if (ctx.workspaceRoots.length > 0) {
      console.log("[Main] Opened workspace:", ctx.workspaceRoots.join(", "));
    }
    return;
  }
  console.warn("[Main] Could not open saved project:", r.error);
  ctx.projectRootPath = null;
  ctx.notesPersistencePath = null;
  ctx.workspaceRoots = [];
  clearNodexUndoRedo();
  deactivateProject();
}

export function persistNotes(): void {
  if (!ctx.notesPersistencePath) {
    return;
  }
  try {
    saveNotesState();
  } catch (e) {
    console.warn("[Main] Failed to save notes:", e);
  }
}

export function assertProjectOpenForNotes(): void {
  if (!ctx.projectRootPath) {
    throw new Error("Open a project folder first (Notes → Open project).");
  }
}

function emitIdeWorkspaceFsChanged(): void {
  ctx.ideWorkspaceWatchTimer = null;
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_IDE_WORKSPACE_FS_CHANGED);
  }
}

export function setIdeWorkspaceWatch(pluginName: string | null): void {
  if (ctx.ideWorkspaceWatch) {
    ctx.ideWorkspaceWatch.close();
    ctx.ideWorkspaceWatch = null;
  }
  if (ctx.ideWorkspaceWatchTimer) {
    clearTimeout(ctx.ideWorkspaceWatchTimer);
    ctx.ideWorkspaceWatchTimer = null;
  }
  if (!pluginName) {
    return;
  }
  if (!isSafePluginName(pluginName)) {
    return;
  }
  const root = getPluginLoader().getPluginWorkspaceAbsolutePath(pluginName);
  if (!root || !fs.existsSync(root)) {
    return;
  }
  try {
    ctx.ideWorkspaceWatch = fs.watch(
      root,
      { recursive: true },
      () => {
        if (ctx.ideWorkspaceWatchTimer) {
          clearTimeout(ctx.ideWorkspaceWatchTimer);
        }
        ctx.ideWorkspaceWatchTimer = setTimeout(emitIdeWorkspaceFsChanged, 320);
      },
    );
  } catch (e) {
    console.warn("[Main] ide workspace watch:", e);
  }
}

export function getDialogParent(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? ctx.mainWindow ?? undefined;
}

export function showOpenDialogWithParent(
  options: Electron.OpenDialogOptions,
): Promise<Electron.OpenDialogReturnValue> {
  const parent = getDialogParent();
  return parent
    ? dialog.showOpenDialog(parent, options)
    : dialog.showOpenDialog(options);
}

export function broadcastNativeThemeToRenderers(): void {
  const dark = nativeTheme.shouldUseDarkColors;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.UI_NATIVE_THEME_CHANGED, dark);
    }
  }
}

export function resolveBundledCorePluginsDir(): string | null {
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

export function broadcastPluginsChanged(): void {
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGINS_CHANGED);
  }
}
