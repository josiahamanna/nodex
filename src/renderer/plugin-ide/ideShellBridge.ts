/** Bridges Primary shell editor column ↔ PluginIDE without a heavy shared store. */

export const IDE_SHELL_STATE_EVENT = "nodex-ide-shell-state";

export type IdeShellStateDetail = {
  pluginFolder: string;
  fileList: string[];
  activePath: string | null;
  busy: boolean;
  dirtyTabCount: number;
  hasActiveTab: boolean;
};

export const IDE_SHELL_PLUGIN_EVENT = "nodex-ide-shell-plugin";
export const IDE_SHELL_OPEN_FILE_EVENT = "nodex-ide-shell-open-file";
export const IDE_SHELL_ACTION_EVENT = "nodex-ide-shell-action";

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
  | "removeExternal";

export function dispatchIdeShellPlugin(folder: string): void {
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_PLUGIN_EVENT, { detail: folder }),
  );
}

export function dispatchIdeShellOpenFile(relativePath: string): void {
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_OPEN_FILE_EVENT, { detail: relativePath }),
  );
}

export function dispatchIdeShellAction(type: IdeShellAction): void {
  window.dispatchEvent(
    new CustomEvent(IDE_SHELL_ACTION_EVENT, { detail: { type } }),
  );
}
