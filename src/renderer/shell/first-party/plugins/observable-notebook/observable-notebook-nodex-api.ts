import type { NodexRendererApi } from "../../../../../shared/nodex-renderer-api";
import type { NodexContributionRegistry } from "../../../nodex-contribution-registry";
import type { ShellLayoutStore } from "../../../layout/ShellLayoutStore";
import type { ShellRegistries } from "../../../registries/ShellRegistriesContext";
import type { ShellViewRegistry } from "../../../views/ShellViewRegistry";
import { buildNodexShellApi, type NodexDevtoolsShellApi } from "../../../devtoolsShellExpose";

type NodexNotebookShellAugment = {
  /** Same as `window.nodex.shell` (layout, commands, views, tabs, keymap, …). */
  shell: NodexDevtoolsShellApi;
  /** Alias for `nodex.shell` (parity with older notebook docs). */
  devtools: NodexDevtoolsShellApi;

  /** Back-compat helpers used in docs/examples. */
  commands: {
    run(commandId: string, args?: Record<string, unknown>): void | Promise<void>;
  };
  openNote(noteId: string): void | Promise<void>;
  openPalette(): void | Promise<void>;
  openMiniBar(prefill?: string): void | Promise<void>;
  openObservableScratch(): void | Promise<void>;
};

/** Injected as the `nodex` builtin: `window.Nodex`, `window.nodex.*`, and notebook helpers. */
export type NodexNotebookHost = NodexRendererApi & NodexNotebookShellAugment & Record<string, unknown>;

/** Command ids exposed to notebooks (allowlist documentation). */
export const NODEX_NOTEBOOK_DOCUMENTED_COMMANDS = [
  "nodex.notes.open",
  "nodex.shell.openPalette",
  "nodex.shell.openMiniBar",
  "nodex.observableNotebook.open",
  "nodex.script.repl.toggle",
  "nodex.shell.toggle.menuRail",
  "nodex.shell.toggle.sidebarPanel",
  "nodex.shell.toggle.companion",
  "nodex.shell.toggle.bottomDock",
  "nodex.shell.toggle.miniBar",
  "nodex.shell.toggle.modeLine",
  "nodex.shell.closeActiveTab",
  "nodex.docs.open",
] as const;

export function createNotebookNodexHost(opts: {
  invoke: (id: string, args?: Record<string, unknown>) => void | Promise<void>;
  registry: NodexContributionRegistry;
  registries: ShellRegistries;
  layout: ShellLayoutStore;
  views: ShellViewRegistry;
}): NodexNotebookHost {
  const { invoke, registry, registries, layout, views } = opts;

  const shell = buildNodexShellApi({ registry, layout, views, registries });

  const fromBridge =
    typeof globalThis !== "undefined" && (globalThis as unknown as { Nodex?: NodexRendererApi }).Nodex
      ? (globalThis as unknown as { Nodex: NodexRendererApi }).Nodex
      : ({} as Partial<NodexRendererApi>);

  const nodexWin: Record<string, unknown> =
    typeof window !== "undefined" && window.nodex && typeof window.nodex === "object"
      ? { ...(window.nodex as object) }
      : {};
  delete nodexWin.shell;

  const thin: NodexNotebookShellAugment = {
    shell,
    devtools: shell,
    commands: {
      run: (commandId, args) => invoke(commandId, args),
    },
    openNote: (noteId) => invoke("nodex.notes.open", { noteId: String(noteId).trim() }),
    openPalette: () => invoke("nodex.shell.openPalette"),
    openMiniBar: (prefill) =>
      invoke("nodex.shell.openMiniBar", prefill != null && prefill !== "" ? { prefill: String(prefill) } : {}),
    openObservableScratch: () => invoke("nodex.observableNotebook.open"),
  };

  return Object.assign({}, fromBridge, nodexWin, thin) as NodexNotebookHost;
}
