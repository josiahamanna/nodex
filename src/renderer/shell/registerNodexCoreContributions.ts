import type { NodexContributionRegistry } from "./nodex-contribution-registry";
import { NODEX_REPL_TOGGLE_EVENT } from "./NodexReplOverlay";

/** Core `nodex.*` commands and host mode-line segments. Expand as features migrate to the registry. */
export function registerNodexCoreContributions(
  registry: NodexContributionRegistry,
): Array<() => void> {
  const disposers: Array<() => void> = [];

  const setTransientStatus = (text: string, ttlMs = 2500): void => {
    const id = `nodex.host.transient.${Date.now()}.${Math.random()
      .toString(16)
      .slice(2)}`;
    const dispose = registry.registerModeLineItem({
      id,
      segment: "host.center",
      priority: 9999,
      text,
      sourcePluginId: null,
      transient: true,
    });
    window.setTimeout(() => dispose(), ttlMs);
  };

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

  disposers.push(
    registry.registerCommand({
      id: "nodex.plugins.listInstalled",
      title: "Plugins: List installed (log)",
      category: "Plugins",
      doc: "Logs installed plugin ids to the console.",
      handler: async () => {
        try {
          const ids = await window.Nodex.getInstalledPlugins();
          // eslint-disable-next-line no-console
          console.info("[Nodex] Installed plugins:", ids);
          setTransientStatus(`Installed plugins: ${ids.length}`);
        } catch (e) {
          setTransientStatus(
            e instanceof Error ? e.message : "Failed to list plugins",
            4500,
          );
        }
      },
    }),
  );

  disposers.push(
    registry.registerCommand({
      id: "nodex.plugins.reloadRegistry",
      title: "Plugins: Reload registry",
      category: "Plugins",
      doc: "Reloads plugins and refreshes registered note types.",
      handler: async () => {
        setTransientStatus("Reloading plugins…", 1500);
        const r = await window.Nodex.reloadPluginRegistry();
        if (r.success) {
          setTransientStatus("Plugins reloaded.");
        } else {
          setTransientStatus(r.error ?? "Plugin reload failed", 4500);
        }
      },
    }),
  );

  const setEnabled = (enabled: boolean) =>
    registry.registerCommand({
      id: enabled ? "nodex.plugins.enable" : "nodex.plugins.disable",
      title: enabled ? "Plugins: Enable…" : "Plugins: Disable…",
      category: "Plugins",
      doc: enabled
        ? "Enable a plugin by id (args: { pluginId })."
        : "Disable a plugin by id (args: { pluginId }).",
      handler: async (args) => {
        const pluginId = String(args?.pluginId ?? "").trim();
        if (!pluginId) {
          setTransientStatus("Missing args.pluginId", 4500);
          return;
        }
        setTransientStatus(
          enabled ? `Enabling ${pluginId}…` : `Disabling ${pluginId}…`,
          1500,
        );
        const r = await window.Nodex.setPluginEnabled(pluginId, enabled);
        if (r.success) {
          setTransientStatus(enabled ? "Enabled." : "Disabled.");
        } else {
          setTransientStatus(r.error ?? "Plugin toggle failed", 4500);
        }
      },
    });

  disposers.push(setEnabled(true), setEnabled(false));

  disposers.push(
    registry.registerCommand({
      id: "nodex.plugins.uninstall",
      title: "Plugins: Uninstall from bin…",
      category: "Plugins",
      doc: "Uninstall a plugin from bin/ (sources preserved). args: { pluginId }",
      handler: async (args) => {
        const pluginId = String(args?.pluginId ?? "").trim();
        if (!pluginId) {
          setTransientStatus("Missing args.pluginId", 4500);
          return;
        }
        setTransientStatus(`Uninstalling ${pluginId}…`, 1500);
        const r = await window.Nodex.uninstallPlugin(pluginId);
        if (r.success) {
          setTransientStatus("Uninstalled.");
        } else {
          setTransientStatus(r.error ?? "Uninstall failed", 4500);
        }
      },
    }),
  );

  disposers.push(
    registry.registerCommand({
      id: "nodex.plugins.installMarketplace",
      title: "Plugins: Install from market…",
      category: "Plugins",
      doc: "Install a marketplace package by basename (args: { packageFile }). Works in Electron and headless web mode.",
      handler: async (args) => {
        const packageFile = String(args?.packageFile ?? "").trim();
        if (!packageFile) {
          setTransientStatus("Missing args.packageFile", 4500);
          return;
        }
        setTransientStatus(`Installing ${packageFile}…`, 1500);
        const r = await window.Nodex.installMarketplacePlugin(packageFile);
        if (r.success) {
          const w =
            r.warnings?.length && r.warnings.length > 0
              ? ` (${r.warnings.length} warning(s))`
              : "";
          setTransientStatus(`Installed.${w}`);
        } else {
          setTransientStatus(r.error ?? "Install failed", 4500);
        }
      },
    }),
  );

  disposers.push(
    registry.registerCommand({
      id: "nodex.script.repl.toggle",
      title: "Nodex: Toggle REPL",
      category: "Nodex",
      doc: "Opens/closes the sandboxed JS REPL overlay (renderer).",
      handler: () => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event(NODEX_REPL_TOGGLE_EVENT));
        }
      },
    }),
  );

  // Shell layout toggles (command-driven UI).
  const toggle = (id: string, title: string, region: string) =>
    registry.registerCommand({
      id,
      title,
      category: "Shell",
      doc: `Toggle shell region visibility: ${region}`,
      handler: () => {
        const api = (window as unknown as { nodex?: { shell?: any } }).nodex?.shell;
        if (api?.layout?.toggle) {
          api.layout.toggle(region);
        } else {
          throw new Error("Shell DevTools API not initialized");
        }
      },
    });

  disposers.push(
    toggle("nodex.shell.toggle.menuRail", "Shell: Toggle menu rail", "menuRail"),
    toggle("nodex.shell.toggle.sidebarPanel", "Shell: Toggle sidebar panel", "sidebarPanel"),
    toggle("nodex.shell.toggle.secondaryArea", "Shell: Toggle secondary area", "secondaryArea"),
    toggle("nodex.shell.toggle.bottomDock", "Shell: Toggle bottom dock", "bottomArea"),
    toggle("nodex.shell.toggle.miniBar", "Shell: Toggle mini bar", "miniBar"),
    toggle("nodex.shell.toggle.modeLine", "Shell: Toggle mode line", "modeLine"),
  );

  return disposers;
}
