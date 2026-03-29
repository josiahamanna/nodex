/** Bridges Primary shell editor column ↔ PluginIDE without a heavy shared store. */

export const IDE_SHELL_STATE_EVENT = "nodex-ide-shell-state";

/** One workspace plugin folder; `fileList` null until lazy-loaded in the shell sidebar. */
export type IdeShellWorkspaceFolder = {
  name: string;
  fileList: string[] | null;
};

export type IdeShellStateDetail = {
  pluginFolder: string;
  /** All registered workspace folders with optional lazy file lists. */
  folders: IdeShellWorkspaceFolder[];
  /** Current plugin’s file list (same as entry in `folders` when loaded). */
  fileList: string[];
  activePath: string | null;
  busy: boolean;
  dirtyTabCount: number;
  hasActiveTab: boolean;
  tscOnSave: boolean;
  formatOnSave: boolean;
  reloadOnSave: boolean;
};

export const IDE_SHELL_PLUGIN_EVENT = "nodex-ide-shell-plugin";
export const IDE_SHELL_OPEN_FILE_EVENT = "nodex-ide-shell-open-file";
export const IDE_SHELL_EXPAND_FOLDER_EVENT = "nodex-ide-shell-expand-folder";
export const IDE_SHELL_ACTION_EVENT = "nodex-ide-shell-action";

export type IdeShellOpenFileDetail =
  | string
  | { pluginFolder: string; relativePath: string };

export type IdeShellAction =
  | "save"
  | "saveAll"
  | "newFile"
  | "newFolder"
  | "importFiles"
  | "importFolder"
  | "delete"
  | "rename"
  | "copy"
  | "paste"
  | "copyDist"
  | "bundle"
  | "bundleReload"
  | "reloadRegistry"
  | "typecheck"
  | "installDeps"
  | "loadParent"
  | "removeExternal"
  | "toggleTscOnSave"
  | "toggleFormatOnSave"
  | "toggleReloadOnSave";

export function dispatchIdeShellPlugin(folder: string): void {
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_PLUGIN_EVENT, { detail: folder }),
  );
}

/** Open a file; pass `pluginFolder` when opening from another workspace’s tree (shell layout). */
export function dispatchIdeShellOpenFile(
  relativePath: string,
  pluginFolder?: string,
): void {
  const detail: IdeShellOpenFileDetail =
    pluginFolder != null && pluginFolder.length > 0
      ? { pluginFolder, relativePath }
      : relativePath;
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_OPEN_FILE_EVENT, { detail }),
  );
}

export function dispatchIdeShellExpandFolder(folder: string): void {
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_EXPAND_FOLDER_EVENT, { detail: folder }),
  );
}

export function dispatchIdeShellAction(type: IdeShellAction): void {
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_ACTION_EVENT, { detail: { type } }),
  );
}
