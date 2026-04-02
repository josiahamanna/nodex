import { contextBridge, ipcRenderer } from "electron";
import type { ClientLogPayload } from "./shared/client-log";
import { IPC_CHANNELS } from "./shared/ipc-channels";
import { buildCanonicalNodexAssetHref } from "./shared/nodex-asset-path";
import type { NodexRendererApi } from "./shared/nodex-renderer-api";

export type {
  CreateNoteRelation,
  MainDebugLogEntry,
  MarketplaceListResponse,
  MarketplacePluginRow,
  Note,
  NoteListItem,
  NoteMovePlacement,
  OpenPluginWorkspaceArgs,
  PasteSubtreePayload,
  PluginInventoryItem,
  PluginProgressPayload,
} from "./shared/nodex-renderer-api";

const api: NodexRendererApi = {
  getNote: (noteId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_NOTE, noteId),
  getAllNotes: () => ipcRenderer.invoke(IPC_CHANNELS.GET_ALL_NOTES),
  createNote: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_NOTE, payload),
  renameNote: (id, title) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_NOTE, id, title),
  deleteNotes: (ids) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_NOTES, ids),
  moveNote: (draggedId, targetId, placement) =>
    ipcRenderer.invoke(IPC_CHANNELS.MOVE_NOTE, {
      draggedId,
      targetId,
      placement,
    }),
  moveNotesBulk: (ids, targetId, placement) =>
    ipcRenderer.invoke(IPC_CHANNELS.MOVE_NOTES_BULK, {
      ids,
      targetId,
      placement,
    }),
  pasteSubtree: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.PASTE_SUBTREE, payload),
  saveNotePluginUiState: (noteId, state) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTE_PLUGIN_UI_STATE, noteId, state),
  saveNoteContent: (noteId, content) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_NOTE_CONTENT, noteId, content),
  patchNoteMetadata: (noteId, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.PATCH_NOTE_METADATA, noteId, patch),
  getPluginHTML: (type, note) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_HTML, type, note),
  getRegisteredTypes: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_REGISTERED_TYPES),
  getSelectableNoteTypes: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SELECTABLE_NOTE_TYPES),
  selectZipFile: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_ZIP_FILE),
  importPlugin: (zipPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PLUGIN, zipPath),
  listMarketplacePlugins: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MARKETPLACE_LIST_PLUGINS),
  installMarketplacePlugin: (packageFile) =>
    ipcRenderer.invoke(IPC_CHANNELS.MARKETPLACE_INSTALL_PLUGIN, packageFile),
  getInstalledPlugins: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_INSTALLED_PLUGINS),
  getPluginInventory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_INVENTORY),
  getDisabledPluginIds: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_DISABLED_IDS),
  setPluginEnabled: (pluginId, enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SET_ENABLED, {
      pluginId,
      enabled,
    }),
  toggleDeveloperTools: () =>
    ipcRenderer.invoke(IPC_CHANNELS.UI_TOGGLE_DEVTOOLS),
  quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.UI_QUIT_APP),
  reloadWindow: () => ipcRenderer.invoke(IPC_CHANNELS.UI_RELOAD_WINDOW),
  getUserPluginsDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_GET_USER_PLUGINS_DIR),
  resetUserPluginsDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_RESET_USER_DATA_PLUGINS),
  deletePluginBinAndCaches: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MAINT_DELETE_BIN_AND_CACHES),
  formatNodexPluginData: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MAINT_FORMAT_NODEX),
  deleteAllPluginSources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_MAINT_DELETE_SOURCES),
  uninstallPlugin: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.UNINSTALL_PLUGIN, pluginName),
  exportPluginDev: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PLUGIN_DEV, pluginName),
  exportPluginProduction: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PLUGIN_PRODUCTION, pluginName),
  publishPluginAsFile: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.PUBLISH_PLUGIN_AS_FILE, pluginName),
  publishPluginToMarketplace: (pluginName, options) =>
    ipcRenderer.invoke(IPC_CHANNELS.PUBLISH_PLUGIN_TO_MARKETPLACE, {
      pluginName,
      options,
    }),
  bundlePluginLocal: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.BUNDLE_PLUGIN_LOCAL, pluginName),
  installPluginDependencies: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSTALL_PLUGIN_DEPENDENCIES, pluginName),
  clearPluginDependencyCache: (pluginName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CLEAR_PLUGIN_DEPENDENCY_CACHE,
      pluginName,
    ),
  clearAllPluginDependencyCaches: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CLEAR_ALL_PLUGIN_DEPENDENCY_CACHES),
  getPluginCacheStats: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_CACHE_STATS),
  onPluginsChanged: (callback) => {
    ipcRenderer.on(IPC_CHANNELS.PLUGINS_CHANGED, callback);
    return () =>
      ipcRenderer.removeListener(IPC_CHANNELS.PLUGINS_CHANGED, callback);
  },
  getProjectState: () => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_GET_STATE),
  getShellLayout: () => ipcRenderer.invoke(IPC_CHANNELS.SHELL_GET_LAYOUT),
  setShellLayout: (layout) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL_SET_LAYOUT, layout),
  getAppPrefs: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PREFS),
  setSeedSampleNotes: (enabled) =>
    ipcRenderer.invoke(IPC_CHANNELS.APP_SET_SEED_SAMPLE_NOTES, enabled),
  selectProjectFolder: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SELECT_FOLDER),
  openProjectPath: (absPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_OPEN_PATH, absPath),
  addWorkspaceFolder: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_ADD_WORKSPACE_FOLDER),
  removeWorkspaceRoot: (projectRootAbs, moveToTrash) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REMOVE_WORKSPACE_ROOT, {
      projectRootAbs,
      moveToTrash,
    }),
  swapWorkspaceBlock: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SWAP_WORKSPACE_BLOCK, payload),
  setWorkspaceFolderLabel: (rootPath, label) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SET_WORKSPACE_LABEL, {
      rootPath,
      label,
    }),
  onProjectRootChanged: (callback) => {
    const ch = IPC_CHANNELS.PROJECT_ROOT_CHANGED;
    ipcRenderer.on(ch, callback);
    return () => ipcRenderer.removeListener(ch, callback);
  },
  listAssets: (relativePath, projectRoot) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.ASSET_LIST,
      projectRoot !== undefined && projectRoot.length > 0
        ? { relativePath, projectRoot }
        : relativePath,
    ),
  listAssetsByCategory: (category, projectRoot) =>
    ipcRenderer.invoke(IPC_CHANNELS.ASSET_LIST_BY_CATEGORY, {
      category,
      ...(projectRoot !== undefined && projectRoot.length > 0
        ? { projectRoot }
        : {}),
    }),
  pickImportMediaFile: (category, projectRoot) =>
    ipcRenderer.invoke(IPC_CHANNELS.ASSET_PICK_IMPORT, {
      category,
      ...(projectRoot !== undefined && projectRoot.length > 0
        ? { projectRoot }
        : {}),
    }),
  getAssetInfo: (relativePath, projectRoot) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.ASSET_GET_INFO,
      projectRoot !== undefined && projectRoot.length > 0
        ? { relativePath, projectRoot }
        : relativePath,
    ),
  readAssetText: (relativePath, projectRoot) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.ASSET_READ_TEXT,
      projectRoot !== undefined && projectRoot.length > 0
        ? { relativePath, projectRoot }
        : relativePath,
    ),
  openAssetExternal: (relativePath, projectRoot) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.ASSET_OPEN_EXTERNAL,
      projectRoot !== undefined && projectRoot.length > 0
        ? { relativePath, projectRoot }
        : relativePath,
    ),
  moveProjectAsset: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.ASSET_MOVE, payload),
  revealAssetInFileManager: (relativePath, projectRoot) =>
    ipcRenderer.invoke(IPC_CHANNELS.ASSET_REVEAL_IN_FILE_MANAGER, {
      relativePath,
      projectRoot,
    }),
  nodexUndo: () => ipcRenderer.invoke(IPC_CHANNELS.NODEX_UNDO),
  nodexRedo: () => ipcRenderer.invoke(IPC_CHANNELS.NODEX_REDO),
  assetUrl: (relativePath, projectRoot) =>
    buildCanonicalNodexAssetHref(
      relativePath,
      projectRoot !== undefined && projectRoot.length > 0
        ? projectRoot
        : undefined,
    ),
  revealProjectFolderInExplorer: (absPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REVEAL_FOLDER, absPath),
  refreshWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REFRESH_WORKSPACE),
  onPluginProgress: (callback) => {
    const ch = IPC_CHANNELS.PLUGIN_PROGRESS;
    const fn = (_e: unknown, p: unknown) =>
      callback(p as Parameters<typeof callback>[0]);
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  validatePluginZip: (zipPath) =>
    ipcRenderer.invoke(IPC_CHANNELS.VALIDATE_PLUGIN_ZIP, zipPath),
  getPluginInstallPlan: (installedFolderName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GET_PLUGIN_INSTALL_PLAN,
      installedFolderName,
    ),
  getPluginResolvedDeps: (installedFolderName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.GET_PLUGIN_RESOLVED_DEPS,
      installedFolderName,
    ),
  runPluginCacheNpm: (installedFolderName, npmArgs) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.RUN_PLUGIN_CACHE_NPM,
      installedFolderName,
      npmArgs,
    ),
  getPluginLoadIssues: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_LOAD_ISSUES),
  listPluginWorkspaceFolders: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LIST_WORKSPACE_FOLDERS),
  listPluginSourceFiles: (installedFolderName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_LIST_SOURCE_FILES,
      installedFolderName,
    ),
  readPluginSourceFile: (installedFolderName, relativePath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_READ_SOURCE_FILE,
      installedFolderName,
      relativePath,
    ),
  writePluginSourceFile: (installedFolderName, relativePath, content) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_WRITE_SOURCE_FILE,
      installedFolderName,
      relativePath,
      content,
    ),
  mkdirPluginSource: (installedFolderName, relativeDir) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_MKDIR_SOURCE,
      installedFolderName,
      relativeDir,
    ),
  createPluginSourceFile: (installedFolderName, relativePath, content) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_CREATE_SOURCE_FILE,
      installedFolderName,
      relativePath,
      content ?? "",
    ),
  deletePluginSourcePath: (installedFolderName, relativePath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_DELETE_SOURCE_PATH,
      installedFolderName,
      relativePath,
    ),
  selectImportFiles: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_FILES),
  selectImportDirectory: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_SELECT_IMPORT_DIRECTORY),
  importFilesIntoWorkspace: (
    installedFolderName,
    absolutePaths,
    destRelativeBase,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IMPORT_FILES_INTO_WORKSPACE,
      installedFolderName,
      absolutePaths,
      destRelativeBase ?? "",
    ),
  importDirectoryIntoWorkspace: (
    installedFolderName,
    absoluteDir,
    destRelativeBase,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IMPORT_DIRECTORY_INTO_WORKSPACE,
      installedFolderName,
      absoluteDir,
      destRelativeBase ?? "",
    ),
  importDirectoryAsNewWorkspace: (absoluteDir) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IMPORT_DIRECTORY_AS_NEW_WORKSPACE,
      absoluteDir,
    ),
  npmRegistrySearch: (query) =>
    ipcRenderer.invoke(IPC_CHANNELS.NPM_REGISTRY_SEARCH, query),
  runPluginTypecheck: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_TYPECHECK, pluginName),
  getIdeTypings: () => ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IDE_TYPINGS),
  getIdePluginTypings: (installedFolderName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_IDE_PLUGIN_TYPINGS,
      installedFolderName,
    ),
  loadNodexPluginsFromParent: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_LOAD_NODEX_FROM_PARENT),
  removeExternalPluginWorkspace: (pluginId) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_REMOVE_EXTERNAL_PLUGIN, pluginId),
  renamePluginSourcePath: (installedFolderName, fromRelative, toRelative) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_RENAME_SOURCE_PATH,
      installedFolderName,
      fromRelative,
      toRelative,
    ),
  copyPluginSourceWithinWorkspace: (
    installedFolderName,
    fromRelative,
    toRelative,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_COPY_SOURCE_WITHIN_WORKSPACE,
      installedFolderName,
      fromRelative,
      toRelative,
    ),
  copyPluginSourceBetweenWorkspaces: (
    fromPlugin,
    fromRelative,
    toPlugin,
    toRelative,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_COPY_SOURCE_BETWEEN_WORKSPACES,
      fromPlugin,
      fromRelative,
      toPlugin,
      toRelative,
    ),
  movePluginSourceBetweenWorkspaces: (
    fromPlugin,
    fromRelative,
    toPlugin,
    toRelative,
  ) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_MOVE_SOURCE_BETWEEN_WORKSPACES,
      fromPlugin,
      fromRelative,
      toPlugin,
      toRelative,
    ),
  copyPluginDistToFolder: (installedFolderName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_COPY_DIST_TO_FOLDER,
      installedFolderName,
    ),
  getPluginSourceEntryKind: (installedFolderName, relativePath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_GET_SOURCE_ENTRY_KIND,
      installedFolderName,
      relativePath,
    ),
  getPluginSourceFileMeta: (installedFolderName, relativePath) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_GET_SOURCE_FILE_META,
      installedFolderName,
      relativePath,
    ),
  openPluginWorkspaceInEditor: (args) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_OPEN_WORKSPACE_IN_EDITOR, args),
  revealPluginWorkspaceInFileManager: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_REVEAL_WORKSPACE, pluginName),
  scaffoldPluginWorkspace: (pluginName) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.PLUGIN_SCAFFOLD_PLUGIN_WORKSPACE,
      pluginName,
    ),
  setIdeWorkspaceWatch: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IDE_SET_WORKSPACE_WATCH, pluginName),
  onIdeWorkspaceFsChanged: (callback) => {
    const ch = IPC_CHANNELS.PLUGIN_IDE_WORKSPACE_FS_CHANGED;
    const fn = () => callback();
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  getMainDebugLogBuffer: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IDE_GET_MAIN_DEBUG_LOGS),
  clearMainDebugLogBuffer: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_IDE_CLEAR_MAIN_DEBUG_LOGS),
  onMainDebugLog: (callback) => {
    const ch = IPC_CHANNELS.PLUGIN_IDE_MAIN_DEBUG_LOG;
    const fn = (_e: unknown, entry: unknown) =>
      callback(entry as Parameters<typeof callback>[0]);
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  sendClientLog: (payload: ClientLogPayload) =>
    ipcRenderer.send(IPC_CHANNELS.NODEX_CLIENT_LOG, payload),
  reloadPluginRegistry: () =>
    ipcRenderer.invoke(IPC_CHANNELS.PLUGIN_RELOAD_REGISTRY),
  getNativeThemeDark: () =>
    ipcRenderer.invoke(IPC_CHANNELS.UI_GET_NATIVE_THEME_DARK),
  onNativeThemeChanged: (callback) => {
    const ch = IPC_CHANNELS.UI_NATIVE_THEME_CHANGED;
    const fn = (_e: unknown, dark: boolean) => callback(dark);
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  onRunContributionCommand: (callback) => {
    const ch = IPC_CHANNELS.UI_RUN_CONTRIBUTION_COMMAND;
    const fn = (_e: unknown, detail: unknown) => {
      const d = detail as { commandId?: string };
      if (typeof d?.commandId === "string") {
        callback({ commandId: d.commandId });
      }
    };
    ipcRenderer.on(ch, fn);
    return () => ipcRenderer.removeListener(ch, fn);
  },
  getPluginRendererUiMeta: (noteType) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_RENDERER_UI_META, noteType),
  getPluginManifestUi: (pluginName) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PLUGIN_MANIFEST_UI, pluginName),
  wpnListWorkspaces: () =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_LIST_WORKSPACES),
  wpnCreateWorkspace: (name) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_CREATE_WORKSPACE, name),
  wpnUpdateWorkspace: (id, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_UPDATE_WORKSPACE, id, patch),
  wpnDeleteWorkspace: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_DELETE_WORKSPACE, id),
  wpnListProjects: (workspaceId) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_LIST_PROJECTS, workspaceId),
  wpnCreateProject: (workspaceId, name) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_CREATE_PROJECT, workspaceId, name),
  wpnUpdateProject: (id, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_UPDATE_PROJECT, id, patch),
  wpnDeleteProject: (id) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_DELETE_PROJECT, id),
  wpnListNotes: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_LIST_NOTES, projectId),
  wpnGetNote: (noteId) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_GET_NOTE, noteId),
  wpnGetExplorerState: (projectId) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_GET_EXPLORER_STATE, projectId),
  wpnSetExplorerState: (projectId, expandedIds) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_SET_EXPLORER_STATE, projectId, expandedIds),
  wpnCreateNoteInProject: (projectId, payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_CREATE_NOTE_IN_PROJECT, projectId, payload),
  wpnPatchNote: (noteId, patch) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_PATCH_NOTE, noteId, patch),
  wpnDeleteNotes: (ids) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_DELETE_NOTES, ids),
  wpnMoveNote: (payload) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_MOVE_NOTE, payload),
  wpnDuplicateNoteSubtree: (projectId, noteId) =>
    ipcRenderer.invoke(IPC_CHANNELS.WPN_DUPLICATE_NOTE_SUBTREE, projectId, noteId),
};

contextBridge.exposeInMainWorld("Nodex", api);
