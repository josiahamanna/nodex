/** Injected as the `nodex` builtin in trusted notebook runs. */
export interface NodexNotebookHost {
  commands: {
    run(commandId: string, args?: Record<string, unknown>): void | Promise<void>;
  };
  openNote(noteId: string): void | Promise<void>;
  openPalette(): void | Promise<void>;
  openMiniBar(prefill?: string): void | Promise<void>;
  openObservableScratch(): void | Promise<void>;
}

/** Command ids exposed to notebooks (allowlist documentation). */
export const NODEX_NOTEBOOK_DOCUMENTED_COMMANDS = [
  "nodex.notes.open",
  "nodex.shell.openPalette",
  "nodex.shell.openMiniBar",
  "nodex.observableNotebook.open",
  "nodex.script.repl.toggle",
  "nodex.shell.toggle.menuRail",
  "nodex.shell.toggle.sidebarPanel",
  "nodex.shell.toggle.secondaryArea",
  "nodex.shell.toggle.bottomDock",
  "nodex.shell.toggle.miniBar",
  "nodex.shell.toggle.modeLine",
  "nodex.shell.closeActiveTab",
  "nodex.docs.open",
] as const;

export function createNotebookNodexHost(
  invoke: (id: string, args?: Record<string, unknown>) => void | Promise<void>,
): NodexNotebookHost {
  return {
    commands: {
      run: (commandId, args) => invoke(commandId, args),
    },
    openNote: (noteId) => invoke("nodex.notes.open", { noteId: String(noteId).trim() }),
    openPalette: () => invoke("nodex.shell.openPalette"),
    openMiniBar: (prefill) =>
      invoke("nodex.shell.openMiniBar", prefill != null && prefill !== "" ? { prefill: String(prefill) } : {}),
    openObservableScratch: () => invoke("nodex.observableNotebook.open"),
  };
}
