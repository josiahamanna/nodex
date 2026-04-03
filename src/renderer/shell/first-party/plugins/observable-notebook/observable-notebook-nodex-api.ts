import type { NodexRendererApi } from "../../../../../shared/nodex-renderer-api";
import type { ShellLayoutStore } from "../../../layout/ShellLayoutStore";
import type { ShellRegistries } from "../../../registries/ShellRegistriesContext";
import type { ShellRegionId } from "../../../layout/ShellLayoutState";

type NodexNotebookShellAugment = {
  /** Proxy/parity surface roughly matching `window.nodex.shell` for notebook cells. */
  shell: {
    tabs: {
      listOpen(): ReturnType<ShellRegistries["tabs"]["listOpenTabs"]>;
      getActive(): ReturnType<ShellRegistries["tabs"]["getActiveTab"]>;
      setActive(instanceId: string): void;
      close(instanceId: string): void;
      openOrReuse(
        tabTypeId: string,
        o?: { title?: string; state?: unknown; reuseKey?: string },
      ): unknown;
    };
    commands: {
      invoke(commandId: string, args?: Record<string, unknown>): void | Promise<void>;
    };
    layout: {
      get(): ReturnType<ShellLayoutStore["get"]>;
      setVisible(regionId: ShellRegionId, visible: boolean): void;
      toggle(regionId: ShellRegionId): void;
      apply(patch: Partial<ReturnType<ShellLayoutStore["get"]>>): void;
    };
  };

  /** Convenience alias: `nodex.devtools.*` maps to the same underlying shell surface. */
  devtools: {
    tabs: NodexNotebookShellAugment["shell"]["tabs"];
    commands: NodexNotebookShellAugment["shell"]["commands"];
    layout: NodexNotebookShellAugment["shell"]["layout"];
  };

  /** Back-compat helpers used in docs/examples. */
  commands: {
    run(commandId: string, args?: Record<string, unknown>): void | Promise<void>;
  };
  openNote(noteId: string): void | Promise<void>;
  openPalette(): void | Promise<void>;
  openMiniBar(prefill?: string): void | Promise<void>;
  openObservableScratch(): void | Promise<void>;
};

/** Injected as the `nodex` builtin: full `window.Nodex` API plus shell helpers. */
export type NodexNotebookHost = NodexRendererApi & NodexNotebookShellAugment;

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

export function createNotebookNodexHost(
  opts: {
    invoke: (id: string, args?: Record<string, unknown>) => void | Promise<void>;
    registries: ShellRegistries;
    layout: ShellLayoutStore;
  },
): NodexNotebookHost {
  const { invoke, registries, layout } = opts;

  const shell: NodexNotebookShellAugment["shell"] = {
    tabs: {
      listOpen: () => registries.tabs.listOpenTabs(),
      getActive: () => registries.tabs.getActiveTab(),
      setActive: (instanceId: string) => registries.tabs.setActiveTab(String(instanceId)),
      close: (instanceId: string) => registries.tabs.closeTab(String(instanceId)),
      openOrReuse: (tabTypeId: string, o?: { title?: string; state?: unknown; reuseKey?: string }) =>
        registries.tabs.openOrReuseTab(String(tabTypeId), o),
    },
    commands: {
      invoke: (commandId: string, args?: Record<string, unknown>) => invoke(commandId, args),
    },
    layout: {
      get: () => layout.get(),
      setVisible: (regionId: ShellRegionId, visible: boolean) =>
        layout.setVisible(regionId, Boolean(visible)),
      toggle: (regionId: ShellRegionId) => layout.toggle(regionId),
      apply: (patch: Partial<ReturnType<ShellLayoutStore["get"]>>) =>
        layout.patch((cur) => ({ ...cur, ...(patch as object) })),
    },
  };

  const thin: NodexNotebookShellAugment = {
    shell,
    devtools: {
      tabs: shell.tabs,
      commands: shell.commands,
      layout: shell.layout,
    },
    commands: {
      run: (commandId, args) => invoke(commandId, args),
    },
    openNote: (noteId) => invoke("nodex.notes.open", { noteId: String(noteId).trim() }),
    openPalette: () => invoke("nodex.shell.openPalette"),
    openMiniBar: (prefill) =>
      invoke("nodex.shell.openMiniBar", prefill != null && prefill !== "" ? { prefill: String(prefill) } : {}),
    openObservableScratch: () => invoke("nodex.observableNotebook.open"),
  };

  const fromBridge =
    typeof globalThis !== "undefined" && (globalThis as unknown as { Nodex?: NodexRendererApi }).Nodex
      ? (globalThis as unknown as { Nodex: NodexRendererApi }).Nodex
      : ({} as Partial<NodexRendererApi>);

  return Object.assign({}, fromBridge, thin) as NodexNotebookHost;
}
