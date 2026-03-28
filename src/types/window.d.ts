import {
  CreateNoteRelation,
  Note,
  NoteListItem,
} from "../preload";

declare global {
  interface Window {
    Nodex: {
      getNote: (noteId?: string) => Promise<Note | null>;
      getAllNotes: () => Promise<NoteListItem[]>;
      createNote: (payload: {
        anchorId?: string;
        relation: CreateNoteRelation;
        type: string;
      }) => Promise<{ id: string }>;
      renameNote: (id: string, title: string) => Promise<void>;
      getComponent: (type: string) => Promise<string | null>;
      getPluginHTML: (type: string, note: Note) => Promise<string | null>;
      getRegisteredTypes: () => Promise<string[]>;
      selectZipFile: () => Promise<string | null>;
      importPlugin: (
        zipPath: string,
      ) => Promise<{
        success: boolean;
        error?: string;
        warnings?: string[];
      }>;
      getInstalledPlugins: () => Promise<string[]>;
      uninstallPlugin: (
        pluginName: string,
      ) => Promise<{ success: boolean; error?: string }>;
      exportPluginDev: (
        pluginName: string,
      ) => Promise<{ success: boolean; path?: string; error?: string }>;
      exportPluginProduction: (
        pluginName: string,
      ) => Promise<{ success: boolean; path?: string; error?: string }>;
      bundlePluginLocal: (pluginName: string) => Promise<{
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
      onPluginProgress: (
        callback: (payload: {
          op: string;
          phase: string;
          message: string;
          pluginName?: string;
        }) => void,
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
      ) => Promise<string>;
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
      copyPluginDistToFolder: (
        installedFolderName: string,
      ) => Promise<{ success: boolean; error?: string }>;
      getPluginSourceEntryKind: (
        installedFolderName: string,
        relativePath: string,
      ) => Promise<"file" | "dir" | "missing">;
      setIdeWorkspaceWatch: (
        pluginName: string | null,
      ) => Promise<{ success: boolean }>;
      onIdeWorkspaceFsChanged: (callback: () => void) => () => void;
      reloadPluginRegistry: () => Promise<{ success: boolean; error?: string }>;
      getNativeThemeDark: () => Promise<boolean>;
      onNativeThemeChanged: (
        callback: (isDark: boolean) => void,
      ) => () => void;
      getPluginRendererUiMeta: (
        noteType: string,
      ) => Promise<{
        theme?: "inherit" | "isolated";
        designSystemVersion?: string;
      } | null>;
      getPluginManifestUi: (
        pluginName: string,
      ) => Promise<{
        theme: "inherit" | "isolated";
        designSystemVersion?: string;
        designSystemWarning: string | null;
      } | null>;
    };
  }
}

export {};
