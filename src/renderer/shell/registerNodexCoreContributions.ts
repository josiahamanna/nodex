import type { NodexContributionRegistry } from "./nodex-contribution-registry";

/** Core `nodex.*` commands and host mode-line segments. Expand as features migrate to the registry. */
export function registerNodexCoreContributions(
  registry: NodexContributionRegistry,
): Array<() => void> {
  const disposers: Array<() => void> = [];

  disposers.push(
    registry.registerModeLineItem({
      id: "nodex.host.ready",
      segment: "host.center",
      priority: 0,
      text: "Ready",
      sourcePluginId: null,
    }),
  );

  disposers.push(
    registry.registerCommand({
      id: "nodex.contributions.listCommands",
      title: "Nodex: Log registered commands (dev)",
      category: "Nodex",
      sourcePluginId: null,
      palette: process.env.NODE_ENV !== "production",
      miniBar: process.env.NODE_ENV !== "production",
      doc: "Prints command count to the console for debugging the contribution registry.",
      handler: () => {
        const n = registry.listCommands().length;
        // eslint-disable-next-line no-console
        console.info(`[Nodex] ${n} command(s) registered`);
      },
    }),
  );

  return disposers;
}
