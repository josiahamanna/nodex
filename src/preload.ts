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
  ): Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PLUGIN, zipPath),
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
    ipcRenderer.on(IPC_CHANNELS.PLUGINS_CHANGED, callback);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.PLUGINS_CHANGED, callback);
  },
  onPluginProgress: (
    callback: (payload: {
      op: string;
      phase: string;
      message: string;
      pluginName?: string;
    }) => void,
  ) => {
    const ch = IPC_CHANNELS.PLUGIN_PROGRESS;
    const fn = (_e: unknown, p: unknown) =>
      callback(p as Parameters<typeof callback>[0]);
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  validatePluginZip: (
    zipPath: string,
  ): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> =>
    ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_PLUGIN_ZIP, zipPath),
  getPluginInstallPlan: (
    installedFolderName: string,
  ): Promise<{
    manifestName: string;
    cacheDir: string;
    dependencies: Record<string, string>;
    dependencyCount: number;
    warnManyDeps: boolean;
    warnLargePackageJson: boolean;
    depsChangedSinceLastInstall: boolean;
    hadSnapshot: boolean;
    registryNotes: string[];
  }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GET_PLUGIN_INSTALL_PLAN,
      installedFolderName,
    ),
  getPluginResolvedDeps: (
    installedFolderName: string,
  ): Promise<{
    declared: Record<string, string>;
    resolved: Record<string, string>;
    error?: string;
  }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GET_PLUGIN_RESOLVED_DEPS,
      installedFolderName,
    ),
  runPluginCacheNpm: (
    installedFolderName: string,
    npmArgs: string[],
  ): Promise<{ success: boolean; error?: string; log?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.RUN_PLUGIN_CACHE_NPM,
      installedFolderName,
      npmArgs,
    ),
  getPluginLoadIssues: (): Promise<{ folder: string; error: string }[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_LOAD_ISSUES),
  listPluginWorkspaceFolders: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST_WORKSPACE_FOLDERS),
  listPluginSourceFiles: (installedFolderName: string): Promise<string[]> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_LIST_SOURCE_FILES,
      installedFolderName,
    ),
  readPluginSourceFile: (
    installedFolderName: string,
    relativePath: string,
  ): Promise<string> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_READ_SOURCE_FILE,
      installedFolderName,
      relativePath,
    ),
  writePluginSourceFile: (
    installedFolderName: string,
    relativePath: string,
    content: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_WRITE_SOURCE_FILE,
      installedFolderName,
      relativePath,
      content,
    ),
  mkdirPluginSource: (
    installedFolderName: string,
    relativeDir: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_MKDIR_SOURCE,
      installedFolderName,
      relativeDir,
    ),
  createPluginSourceFile: (
    installedFolderName: string,
    relativePath: string,
    content?: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_CREATE_SOURCE_FILE,
      installedFolderName,
      relativePath,
      content ?? "",
    ),
  deletePluginSourcePath: (
    installedFolderName: string,
    relativePath: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_DELETE_SOURCE_PATH,
      installedFolderName,
      relativePath,
    ),
  selectImportFiles: (): Promise<string[] | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_FILES),
  selectImportDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_DIRECTORY),
  importFilesIntoWorkspace: (
    installedFolderName: string,
    absolutePaths: string[],
    destRelativeBase?: string,
  ): Promise<{
    success: boolean;
    imported?: string[];
    error?: string;
  }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IMPORT_FILES_INTO_WORKSPACE,
      installedFolderName,
      absolutePaths,
      destRelativeBase ?? "",
    ),
  importDirectoryIntoWorkspace: (
    installedFolderName: string,
    absoluteDir: string,
    destRelativeBase?: string,
  ): Promise<{
    success: boolean;
    imported?: string[];
    error?: string;
  }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IMPORT_DIRECTORY_INTO_WORKSPACE,
      installedFolderName,
      absoluteDir,
      destRelativeBase ?? "",
    ),
  npmRegistrySearch: (
    query: string,
  ): Promise<{
    success: boolean;
    error?: string;
    results: {
      name: string;
      version: string;
      description: string;
      popularity: number;
    }[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.NPM_REGISTRY_SEARCH, query),
  runPluginTypecheck: (
    pluginName: string,
  ): Promise<{
    success: boolean;
    error?: string;
    diagnostics: {
      relativePath: string;
      line: number;
      column: number;
      message: string;
      category: "error" | "warning" | "suggestion";
      code: number | undefined;
    }[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_TYPECHECK, pluginName),
  getIdeTypings: (): Promise<{
    libs: { fileName: string; content: string }[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IDE_TYPINGS),
  getIdePluginTypings: (
    installedFolderName: string,
  ): Promise<{
    workspaceRootFileUri: string;
    libs: { fileName: string; content: string }[];
  } | null> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IDE_PLUGIN_TYPINGS,
      installedFolderName,
    ),
  loadNodexPluginsFromParent: (): Promise<{
    success: boolean;
    cancelled?: boolean;
    added: string[];
    warnings: string[];
    errors: string[];
  }> => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LOAD_NODEX_FROM_PARENT),
  removeExternalPluginWorkspace: (
    pluginId: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_REMOVE_EXTERNAL_PLUGIN, pluginId),
  renamePluginSourcePath: (
    installedFolderName: string,
    fromRelative: string,
    toRelative: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_RENAME_SOURCE_PATH,
      installedFolderName,
      fromRelative,
      toRelative,
    ),
  copyPluginSourceWithinWorkspace: (
    installedFolderName: string,
    fromRelative: string,
    toRelative: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_COPY_SOURCE_WITHIN_WORKSPACE,
      installedFolderName,
      fromRelative,
      toRelative,
    ),
  copyPluginDistToFolder: (
    installedFolderName: string,
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_COPY_DIST_TO_FOLDER, installedFolderName),
  getPluginSourceEntryKind: (
    installedFolderName: string,
    relativePath: string,
  ): Promise<"file" | "dir" | "missing"> =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_GET_SOURCE_ENTRY_KIND,
      installedFolderName,
      relativePath,
    ),
  setIdeWorkspaceWatch: (
    pluginName: string | null,
  ): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IDE_SET_WORKSPACE_WATCH, pluginName),
  onIdeWorkspaceFsChanged: (callback: () => void) => {
    const ch = IPC_CHANNELS.PLUGIN_IDE_WORKSPACE_FS_CHANGED;
    const fn = () => callback();
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  reloadPluginRegistry: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_RELOAD_REGISTRY),
});
