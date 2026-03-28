import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./shared/ipc-channels";

export interface Note {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}

export interface NoteListItem {
  id: string;
  type: string;
  title: string;
}

contextBridge.exposeInMainWorld("Nodex", {
  getNote: (noteId?: string): Promise<Note> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_NOTE, noteId),
  getAllNotes: (): Promise<NoteListItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_NOTES),
  getComponent: (type: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_COMPONENT, type),
  getPluginHTML: (type: string, note: Note): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_HTML, type, note),
  getRegisteredTypes: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_REGISTERED_TYPES),
  selectZipFile: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_ZIP_FILE),
  importPlugin: (
    zipPath: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PLUGIN, zipPath),
  getInstalledPlugins: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_INSTALLED_PLUGINS),
  uninstallPlugin: (
    pluginName: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.UNINSTALL_PLUGIN, pluginName),
  exportPluginDev: (
    pluginName: string,
  ): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PLUGIN_DEV, pluginName),
  exportPluginProduction: (
    pluginName: string,
  ): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PLUGIN_PRODUCTION, pluginName),
  bundlePluginLocal: (
    pluginName: string,
  ): Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.BUNDLE_PLUGIN_LOCAL, pluginName),
  installPluginDependencies: (
    pluginName: string,
  ): Promise<{ success: boolean; error?: string; log?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.INSTALL_PLUGIN_DEPENDENCIES, pluginName),
  clearPluginDependencyCache: (
    pluginName: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_PLUGIN_DEPENDENCY_CACHE, pluginName),
  clearAllPluginDependencyCaches: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_ALL_PLUGIN_DEPENDENCY_CACHES),
  getPluginCacheStats: (): Promise<{
    root: string;
    totalBytes: number;
    plugins: { name: string; bytes: number }[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_CACHE_STATS),
  onPluginsChanged: (callback: () => void) => {
    ipcRenderer.on("plugins-changed", callback);
    return () => ipcRenderer.removeListener("plugins-changed", callback);
  },
});
