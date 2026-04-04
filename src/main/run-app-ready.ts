import { app, Menu } from "electron";
import { pluginCacheManager } from "../core/plugin-cache-manager";
import { PluginLoader } from "../core/plugin-loader";
import { seedSamplePluginsToUserDir } from "../core/seed-user-plugins";
import { setPluginProgressSink } from "../core/plugin-progress";
import { initJsxCompilerCache } from "../core/jsx-compiler";
import {
  getNodexJsxCacheRoot,
  getNodexPluginCacheRoot,
  getNodexUserPluginsDir,
} from "../core/nodex-paths";
import { readAppPrefs } from "../core/app-prefs";
import { setSeedSampleNotesPreference } from "../core/notes-store";
import { registry } from "../core/registry";
import { registerBuiltinMarkdownNoteRenderer } from "../core/register-builtin-markdown-note-type";
import { registerBuiltinObservableNoteRenderer } from "../core/register-builtin-observable-note-type";
import {
  installMainProcessDebugLogTap,
  setMainDebugLogWindow,
} from "./main-process-debug-log";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ctx, getPluginLoader } from "./main-context";
import { createMainWindow } from "./create-main-window";
import {
  registerNodexAssetProtocol,
  registerNodexPdfWorkerProtocol,
  resolveBundledReadonlyPluginRoots,
  tryLoadSavedProject,
} from "./main-helpers";
import { registerRunAppReadyEarlyIpc } from "./register-run-app-ready-early-ipc";
import { registerRunAppReadyNotesTreeIpc } from "./register-run-app-ready-notes-ipc";
import { registerRunAppReadyProjectIpc } from "./register-run-app-ready-project-ipc";
import { registerRunAppReadyUiPluginIpc } from "./register-run-app-ready-ui-plugin-ipc";

export function runAppReady(): void {
  Menu.setApplicationMenu(null);
  installMainProcessDebugLogTap();
  setMainDebugLogWindow(() => ctx.mainWindow);

  registerRunAppReadyEarlyIpc();

  const userDataPath = app.getPath("userData");
  pluginCacheManager.setRoot(getNodexPluginCacheRoot(userDataPath));
  pluginCacheManager.ensureRoot();
  initJsxCompilerCache(getNodexJsxCacheRoot(userDataPath));

  const pluginsPath = getNodexUserPluginsDir(userDataPath);
  const bundledRoots = resolveBundledReadonlyPluginRoots();
  console.log("[Main] User plugins dir:", pluginsPath);
  if (bundledRoots.length > 0) {
    console.log("[Main] Bundled readonly plugin roots:", bundledRoots);
  } else if (!app.isPackaged) {
    console.warn(
      "[Main] No bundled plugin roots found (expected ./plugins/system and/or ./plugins/user).",
    );
  }

  seedSamplePluginsToUserDir(pluginsPath);

  ctx.pluginLoader = new PluginLoader(pluginsPath, bundledRoots);
  getPluginLoader().setUserDataPathForDisabled(userDataPath);
  getPluginLoader().setPluginCatalogUserDataPath(userDataPath);

  registerRunAppReadyUiPluginIpc();

  getPluginLoader().loadAll(registry);
  registerBuiltinObservableNoteRenderer(registry);
  registerBuiltinMarkdownNoteRenderer(registry);

  setSeedSampleNotesPreference(readAppPrefs(userDataPath).seedSampleNotes);

  registerNodexAssetProtocol();
  registerNodexPdfWorkerProtocol();
  tryLoadSavedProject(userDataPath, registry.getRegisteredTypes());
  if (ctx.projectRootPath) {
    console.log("[Main] Notes database:", ctx.notesPersistencePath);
  } else {
    console.log(
      "[Main] No project open — use Open project to choose a folder.",
    );
  }

  registerRunAppReadyNotesTreeIpc();
  registerRunAppReadyProjectIpc(userDataPath);

  createMainWindow();

  setPluginProgressSink((payload) => {
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
      ctx.mainWindow.webContents.send(IPC_CHANNELS.PLUGIN_PROGRESS, payload);
    }
  });
}
