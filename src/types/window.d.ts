import { Note, NoteListItem } from "../preload";

declare global {
  interface Window {
    Nodex: {
      getNote: (noteId?: string) => Promise<Note>;
      getAllNotes: () => Promise<NoteListItem[]>;
      getComponent: (type: string) => Promise<string | null>;
      getPluginHTML: (type: string, note: Note) => Promise<string | null>;
      getRegisteredTypes: () => Promise<string[]>;
      selectZipFile: () => Promise<string | null>;
      importPlugin: (
        zipPath: string,
      ) => Promise<{ success: boolean; error?: string }>;
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
    };
  }
}

export {};
