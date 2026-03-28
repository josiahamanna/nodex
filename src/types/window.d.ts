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
      onPluginsChanged: (callback: () => void) => () => void;
    };
  }
}

export {};
