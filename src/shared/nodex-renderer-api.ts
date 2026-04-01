/**
 * Single source of truth for the preload → renderer `window.Nodex` contract.
 * Preload implements this interface; `window.d.ts` references it.
 */

import type { ClientLogPayload } from "./client-log";
import type { AssetMediaCategory } from "./asset-media";
import type {
  WpnNoteDetail,
  WpnNoteListItem,
  WpnProjectPatch,
  WpnProjectRow,
  WpnWorkspacePatch,
  WpnWorkspaceRow,
} from "./wpn-v2-types";

export interface Note {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface NoteListItem {
  id: string;
  type: string;
  title: string;
  parentId: string | null;
  depth: number;
}

export type CreateNoteRelation = "child" | "sibling" | "root";

export type NoteMovePlacement = "before" | "after" | "into";

export type PasteSubtreePayload = {
  sourceId: string;
  targetId: string;
  mode: "cut" | "copy";
  placement: NoteMovePlacement;
};

export type PluginInventoryItem = {
  id: string;
  isBundled: boolean;
  canToggle: boolean;
  enabled: boolean;
  loaded: boolean;
};

export type PluginProgressPayload = {
  op: string;
  phase: string;
  message: string;
  pluginName?: string;
};

export type MainDebugLogEntry = { ts: number; level: string; text: string };

/** Row from marketplace-index.json (HTTP and Electron). */
export type MarketplacePluginRow = {
  name: string;
  version: string;
  displayName?: string;
  description?: string;
  packageFile: string;
  markdownFile: string | null;
  readmeSnippet?: string;
};

export type MarketplaceListResponse = {
  /** Web: `/marketplace/files` on the API server. Electron: empty (use install IPC). */
  filesBasePath: string;
  marketplaceDir?: string;
  generatedAt: string;
  plugins: MarketplacePluginRow[];
  indexError?: string;
};

export type OpenPluginWorkspaceArgs = {
  editor: string;
  customBin?: string;
  pluginName: string;
};

export type NodexRendererApi = {
  getNote: (noteId?: string) => Promise<Note | null>;
  getAllNotes: () => Promise<NoteListItem[]>;
  createNote: (payload: {
    anchorId?: string;
    relation: CreateNoteRelation;
    type: string;
    content?: string;
    title?: string;
  }) => Promise<{ id: string }>;
  renameNote: (id: string, title: string) => Promise<void>;
  deleteNotes: (ids: string[]) => Promise<void>;
  moveNote: (
    draggedId: string,
    targetId: string,
    placement: NoteMovePlacement,
  ) => Promise<void>;
  moveNotesBulk: (
    ids: string[],
    targetId: string,
    placement: NoteMovePlacement,
  ) => Promise<void>;
  pasteSubtree: (
    payload: PasteSubtreePayload,
  ) => Promise<{ newRootId?: string }>;
  saveNotePluginUiState: (
    noteId: string,
    state: unknown,
  ) => Promise<void>;
  saveNoteContent: (noteId: string, content: string) => Promise<void>;
  getComponent: (type: string) => Promise<string | null>;
  getPluginHTML: (type: string, note: Note) => Promise<string | null>;
  getRegisteredTypes: () => Promise<string[]>;
  /** Note types the user may pick when creating a note (excludes system plugins). */
  getSelectableNoteTypes: () => Promise<string[]>;
  selectZipFile: () => Promise<string | null>;
  importPlugin: (
    zipPath: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
  }>;
  listMarketplacePlugins: () => Promise<MarketplaceListResponse>;
  /** Install a package listed in the local marketplace (basename under marketplace dir). Electron only. */
  installMarketplacePlugin: (
    packageFile: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
  }>;
  getInstalledPlugins: () => Promise<string[]>;
  getPluginInventory: () => Promise<PluginInventoryItem[]>;
  getDisabledPluginIds: () => Promise<string[]>;
  setPluginEnabled: (
    pluginId: string,
    enabled: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  toggleDeveloperTools: () => Promise<{ success: boolean }>;
  quitApp: () => Promise<{ success: boolean }>;
  reloadWindow: () => Promise<{ success: boolean }>;
  getUserPluginsDirectory: () => Promise<{ path: string; error?: string }>;
  resetUserPluginsDirectory: () => Promise<{
    success: boolean;
    path: string;
    error?: string;
  }>;
  deletePluginBinAndCaches: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  formatNodexPluginData: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  deleteAllPluginSources: () => Promise<{
    success: boolean;
    error?: string;
  }>;
  uninstallPlugin: (
    pluginName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  exportPluginDev: (
    pluginName: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  exportPluginProduction: (
    pluginName: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  publishPluginAsFile: (
    pluginName: string,
  ) => Promise<{ success: boolean; path?: string; error?: string }>;
  publishPluginToMarketplace: (
    pluginName: string,
    options: { baseUrl: string; token: string },
  ) => Promise<{ success: boolean; error?: string }>;
  bundlePluginLocal: (
    pluginName: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    warnings?: string[];
  }>;
  installPluginDependencies: (
    pluginName: string,
  ) => Promise<{ success: boolean; error?: string; log?: string }>;
  clearPluginDependencyCache: (
    pluginName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  clearAllPluginDependencyCaches: () => Promise<{ success: boolean }>;
  getPluginCacheStats: () => Promise<{
    root: string;
    totalBytes: number;
    plugins: { name: string; bytes: number }[];
  }>;
  onPluginsChanged: (callback: () => void) => () => void;
  getProjectState: () => Promise<{
    rootPath: string | null;
    notesDbPath: string | null;
    workspaceRoots: string[];
    workspaceLabels: Record<string, string>;
  }>;
  /** Renderer-owned shell layout prefs stored in project prefs (host-managed). */
  getShellLayout: () => Promise<unknown>;
  setShellLayout: (layout: unknown) => Promise<{ ok: true } | { ok: false; error: string }>;
  getAppPrefs: () => Promise<{ seedSampleNotes: boolean }>;
  setSeedSampleNotes: (
    enabled: boolean,
  ) => Promise<
    { ok: true; seedSampleNotes: boolean } | { ok: false; error: string }
  >;
  selectProjectFolder: () => Promise<
    | { ok: true; rootPath: string | null; workspaceRoots: string[] }
    | { ok: false; cancelled: true }
    | { ok: false; error: string }
  >;
  openProjectPath: (
    absPath: string,
  ) => Promise<
    | { ok: true; rootPath: string | null; workspaceRoots: string[] }
    | { ok: false; error: string }
  >;
  addWorkspaceFolder: () => Promise<
    | { ok: true; rootPath: string | null; workspaceRoots: string[] }
    | { ok: false; cancelled: true }
    | { ok: false; error: string }
  >;
  removeWorkspaceRoot: (
    projectRootAbs: string,
    moveToTrash: boolean,
  ) => Promise<
    | {
        ok: true;
        rootPath: string | null;
        workspaceRoots: string[];
        trashError?: string;
      }
    | { ok: false; error: string }
  >;
  swapWorkspaceBlock: (payload: {
    blockIndex: number;
    direction: "up" | "down";
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  setWorkspaceFolderLabel: (
    rootPath: string,
    label: string | null,
  ) => Promise<
    | { ok: true; workspaceLabels: Record<string, string> }
    | { ok: false; error: string }
  >;
  onProjectRootChanged: (callback: () => void) => () => void;
  listAssets: (
    relativePath: string,
    projectRoot?: string,
  ) => Promise<
    | { ok: true; entries: { name: string; isDirectory: boolean }[] }
    | { ok: false; error: string }
  >;
  listAssetsByCategory: (
    category: AssetMediaCategory,
    projectRoot?: string,
  ) => Promise<
    | { ok: true; files: { relativePath: string; name: string }[] }
    | { ok: false; error: string }
  >;
  pickImportMediaFile: (
    category: AssetMediaCategory,
    projectRoot?: string,
  ) => Promise<
    { ok: true; assetRel: string } | { ok: false; error: string }
  >;
  getAssetInfo: (
    relativePath: string,
    projectRoot?: string,
  ) => Promise<{
    name: string;
    ext: string;
    size: number;
    relativePath: string;
  } | null>;
  readAssetText: (
    relativePath: string,
    projectRoot?: string,
  ) => Promise<{ ok: true; text: string } | { ok: false; error: string }>;
  openAssetExternal: (
    relativePath: string,
    projectRoot?: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  moveProjectAsset: (payload: {
    fromProject: string;
    fromRel: string;
    toProject: string;
    toDirRel: string;
  }) => Promise<{ ok: true; toRel: string } | { ok: false; error: string }>;
  /** `relativePath` under `assets/`; use `""` for the assets folder root. */
  revealAssetInFileManager: (
    relativePath: string,
    projectRoot: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  nodexUndo: () => Promise<
    | { ok: true; touchedNotes: boolean }
    | { ok: false; error: string; touchedNotes?: boolean }
  >;
  nodexRedo: () => Promise<
    | { ok: true; touchedNotes: boolean }
    | { ok: false; error: string; touchedNotes?: boolean }
  >;
  assetUrl: (relativePath: string, projectRoot?: string) => string;
  revealProjectFolderInExplorer: (
    absPath: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  refreshWorkspace: () => Promise<
    | { ok: true; rootPath: string | null; workspaceRoots: string[] }
    | { ok: false; error: string }
  >;
  onPluginProgress: (
    callback: (payload: PluginProgressPayload) => void,
  ) => () => void;
  validatePluginZip: (
    zipPath: string,
  ) => Promise<{ valid: boolean; errors: string[]; warnings: string[] }>;
  getPluginInstallPlan: (
    installedFolderName: string,
  ) => Promise<{
    manifestName: string;
    cacheDir: string;
    dependencies: Record<string, string>;
    dependencyCount: number;
    warnManyDeps: boolean;
    warnLargePackageJson: boolean;
    depsChangedSinceLastInstall: boolean;
    hadSnapshot: boolean;
    registryNotes: string[];
  }>;
  getPluginResolvedDeps: (
    installedFolderName: string,
  ) => Promise<{
    declared: Record<string, string>;
    resolved: Record<string, string>;
    error?: string;
  }>;
  runPluginCacheNpm: (
    installedFolderName: string,
    npmArgs: string[],
  ) => Promise<{ success: boolean; error?: string; log?: string }>;
  getPluginLoadIssues: () => Promise<{ folder: string; error: string }[]>;
  listPluginWorkspaceFolders: () => Promise<string[]>;
  listPluginSourceFiles: (installedFolderName: string) => Promise<string[]>;
  readPluginSourceFile: (
    installedFolderName: string,
    relativePath: string,
  ) => Promise<string | null>;
  writePluginSourceFile: (
    installedFolderName: string,
    relativePath: string,
    content: string,
  ) => Promise<{ success: boolean; error?: string }>;
  mkdirPluginSource: (
    installedFolderName: string,
    relativeDir: string,
  ) => Promise<{ success: boolean; error?: string }>;
  createPluginSourceFile: (
    installedFolderName: string,
    relativePath: string,
    content?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  deletePluginSourcePath: (
    installedFolderName: string,
    relativePath: string,
  ) => Promise<{ success: boolean; error?: string }>;
  selectImportFiles: () => Promise<string[] | null>;
  selectImportDirectory: () => Promise<string | null>;
  importFilesIntoWorkspace: (
    installedFolderName: string,
    absolutePaths: string[],
    destRelativeBase?: string,
  ) => Promise<{
    success: boolean;
    imported?: string[];
    error?: string;
  }>;
  importDirectoryIntoWorkspace: (
    installedFolderName: string,
    absoluteDir: string,
    destRelativeBase?: string,
  ) => Promise<{
    success: boolean;
    imported?: string[];
    error?: string;
  }>;
  importDirectoryAsNewWorkspace: (
    absoluteDir: string,
  ) => Promise<{
    success: boolean;
    folderName?: string;
    imported?: string[];
    error?: string;
  }>;
  npmRegistrySearch: (
    query: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    results: {
      name: string;
      version: string;
      description: string;
      popularity: number;
    }[];
  }>;
  runPluginTypecheck: (
    pluginName: string,
  ) => Promise<{
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
  }>;
  getIdeTypings: () => Promise<{
    libs: { fileName: string; content: string }[];
  }>;
  getIdePluginTypings: (
    installedFolderName: string,
  ) => Promise<{
    workspaceRootFileUri: string;
    libs: { fileName: string; content: string }[];
  } | null>;
  loadNodexPluginsFromParent: () => Promise<{
    success: boolean;
    cancelled?: boolean;
    added: string[];
    warnings: string[];
    errors: string[];
  }>;
  removeExternalPluginWorkspace: (
    pluginId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  renamePluginSourcePath: (
    installedFolderName: string,
    fromRelative: string,
    toRelative: string,
  ) => Promise<{ success: boolean; error?: string }>;
  copyPluginSourceWithinWorkspace: (
    installedFolderName: string,
    fromRelative: string,
    toRelative: string,
  ) => Promise<{ success: boolean; error?: string }>;
  copyPluginSourceBetweenWorkspaces: (
    fromPlugin: string,
    fromRelative: string,
    toPlugin: string,
    toRelative: string,
  ) => Promise<{ success: boolean; error?: string }>;
  movePluginSourceBetweenWorkspaces: (
    fromPlugin: string,
    fromRelative: string,
    toPlugin: string,
    toRelative: string,
  ) => Promise<{ success: boolean; error?: string }>;
  copyPluginDistToFolder: (
    installedFolderName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  getPluginSourceEntryKind: (
    installedFolderName: string,
    relativePath: string,
  ) => Promise<"file" | "dir" | "missing">;
  getPluginSourceFileMeta: (
    installedFolderName: string,
    relativePath: string,
  ) => Promise<{ mtimeMs: number; size: number } | null>;
  openPluginWorkspaceInEditor: (
    args: OpenPluginWorkspaceArgs,
  ) => Promise<{ success: boolean; error?: string }>;
  revealPluginWorkspaceInFileManager: (
    pluginName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  scaffoldPluginWorkspace: (
    pluginName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  setIdeWorkspaceWatch: (
    pluginName: string | null,
  ) => Promise<{ success: boolean }>;
  onIdeWorkspaceFsChanged: (callback: () => void) => () => void;
  getMainDebugLogBuffer: () => Promise<MainDebugLogEntry[]>;
  clearMainDebugLogBuffer: () => Promise<{ success: boolean }>;
  onMainDebugLog: (
    callback: (entry: MainDebugLogEntry) => void,
  ) => () => void;
  sendClientLog: (payload: ClientLogPayload) => void;
  reloadPluginRegistry: () => Promise<{ success: boolean; error?: string }>;
  getNativeThemeDark: () => Promise<boolean>;
  onNativeThemeChanged: (
    callback: (isDark: boolean) => void,
  ) => () => void;
  /** Subscribe to main-process menu (or other) triggers that run an in-app command by id. */
  onRunContributionCommand: (
    callback: (detail: { commandId: string }) => void,
  ) => () => void;
  getPluginRendererUiMeta: (
    noteType: string,
  ) => Promise<{
    theme?: "inherit" | "isolated";
    designSystemVersion?: string;
    deferDisplayUntilContentReady?: boolean;
  } | null>;
  getPluginManifestUi: (
    pluginName: string,
  ) => Promise<{
    theme: "inherit" | "isolated";
    designSystemVersion?: string;
    designSystemWarning: string | null;
  } | null>;
  /** Workspace / project (v2). Electron: IPC + SQLite. Web: HTTP `/api/v1/wpn/...`. */
  wpnListWorkspaces: () => Promise<{ workspaces: WpnWorkspaceRow[] }>;
  wpnCreateWorkspace: (name?: string) => Promise<{ workspace: WpnWorkspaceRow }>;
  wpnUpdateWorkspace: (
    id: string,
    patch: WpnWorkspacePatch,
  ) => Promise<{ workspace: WpnWorkspaceRow }>;
  wpnDeleteWorkspace: (id: string) => Promise<{ ok: true }>;
  wpnListProjects: (
    workspaceId: string,
  ) => Promise<{ projects: WpnProjectRow[] }>;
  wpnCreateProject: (
    workspaceId: string,
    name?: string,
  ) => Promise<{ project: WpnProjectRow }>;
  wpnUpdateProject: (
    id: string,
    patch: WpnProjectPatch,
  ) => Promise<{ project: WpnProjectRow }>;
  wpnDeleteProject: (id: string) => Promise<{ ok: true }>;
  wpnListNotes: (projectId: string) => Promise<{ notes: WpnNoteListItem[] }>;
  wpnGetExplorerState: (projectId: string) => Promise<{ expanded_ids: string[] }>;
  wpnSetExplorerState: (
    projectId: string,
    expandedIds: string[],
  ) => Promise<{ expanded_ids: string[] }>;
  wpnCreateNoteInProject: (
    projectId: string,
    payload: {
      anchorId?: string;
      relation: CreateNoteRelation;
      type: string;
      content?: string;
      title?: string;
    },
  ) => Promise<{ id: string }>;
  wpnPatchNote: (
    noteId: string,
    patch: {
      title?: string;
      content?: string;
      type?: string;
      metadata?: Record<string, unknown> | null;
    },
  ) => Promise<{ note: WpnNoteDetail }>;
  wpnDeleteNotes: (ids: string[]) => Promise<{ ok: true }>;
  wpnMoveNote: (payload: {
    projectId: string;
    draggedId: string;
    targetId: string;
    placement: NoteMovePlacement;
  }) => Promise<{ ok: true }>;
};
