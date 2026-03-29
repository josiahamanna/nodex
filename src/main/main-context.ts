import type { BrowserWindow } from "electron";
import type { PluginLoader } from "../core/plugin-loader";
import * as fs from "fs";

/** Mutable main-process state shared across IPC modules (set during `app.ready`). */
export const ctx = {
  mainWindow: null as BrowserWindow | null,
  pluginLoader: null as PluginLoader | null,
  notesPersistencePath: null as string | null,
  projectRootPath: null as string | null,
  workspaceRoots: [] as string[],
  ideWorkspaceWatch: null as fs.FSWatcher | null,
  ideWorkspaceWatchTimer: null as ReturnType<typeof setTimeout> | null,
};

export function getPluginLoader(): PluginLoader {
  if (!ctx.pluginLoader) {
    throw new Error("PluginLoader not initialized");
  }
  return ctx.pluginLoader;
}
