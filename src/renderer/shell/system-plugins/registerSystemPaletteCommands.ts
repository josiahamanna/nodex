import type { NodexContributionRegistry } from "../nodex-contribution-registry";

export const SYSTEM_SHELL_PLUGIN_ID = "nodex.system.shell";

/**
 * System "plugin" surface for command palette + mini buffer open commands.
 * Registered once from {@link useNodexShell} when the shell VM is active.
 */
export function registerSystemPaletteCommands(
  registry: NodexContributionRegistry,
  handlers: {
    openPalette: () => void;
    openMiniBar: (prefill?: string) => void;
  },
): () => void {
  const disposePalette = registry.registerCommand({
    id: "nodex.shell.openPalette",
    title: "Shell: Open command palette",
    category: "Shell",
    sourcePluginId: SYSTEM_SHELL_PLUGIN_ID,
    doc: "Open the command palette UI.",
    handler: () => handlers.openPalette(),
  });
  const disposeMini = registry.registerCommand({
    id: "nodex.shell.openMiniBar",
    title: "Shell: Open mini buffer (M-x)",
    category: "Shell",
    sourcePluginId: SYSTEM_SHELL_PLUGIN_ID,
    doc: "Open the mini buffer input UI.",
    handler: (args) => {
      const prefill = String(args?.prefill ?? "");
      try {
        window.dispatchEvent(new CustomEvent("nodex-minibar-focus", { detail: { prefill } }));
      } catch {
        /* ignore */
      }
      handlers.openMiniBar(prefill);
    },
  });
  return () => {
    disposePalette();
    disposeMini();
  };
}
