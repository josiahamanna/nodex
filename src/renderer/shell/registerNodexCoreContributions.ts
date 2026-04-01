import type { NodexContributionRegistry } from "./nodex-contribution-registry";
import type { ShellRegistries } from "./registries/ShellRegistriesContext";
import type { ShellKeyBinding } from "./registries/ShellKeymapRegistry";
import { NODEX_REPL_TOGGLE_EVENT } from "./NodexReplOverlay";

/** Core `nodex.*` commands and host mode-line segments. Expand as features migrate to the registry. */
export function registerNodexCoreContributions(
  registry: NodexContributionRegistry,
  registries?: ShellRegistries,
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
      api: {
        summary: "Development helper: log how many commands are registered.",
        args: [],
        exampleInvoke: {},
        returns: { type: "void", description: "console.info with count." },
      },
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
      api: {
        summary: "List installed plugin ids via window.Nodex.getInstalledPlugins().",
        args: [],
        exampleInvoke: {},
        returns: {
          type: "Promise<void>",
          description: "Resolves after logging; may update transient mode line.",
        },
      },
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
      api: {
        summary: "Reload plugin registry through the host (Electron IPC or web API).",
        args: [],
        exampleInvoke: {},
        returns: {
          type: "Promise<void>",
          description: "Resolves after window.Nodex.reloadPluginRegistry(); shows status in mode line.",
        },
      },
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
      api: {
        summary: enabled ? "Enable an installed plugin by id." : "Disable a plugin by id.",
        args: [
          {
            name: "pluginId",
            type: "string",
            required: true,
            description: "Plugin package id as returned by getInstalledPlugins.",
          },
        ],
        exampleInvoke: { pluginId: "com.example.plugin" },
        returns: {
          type: "Promise<void>",
          description: "Calls window.Nodex.setPluginEnabled(pluginId, enabled).",
        },
      },
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
      api: {
        summary: "Remove a plugin from the runtime bin; sources may remain on disk.",
        args: [
          {
            name: "pluginId",
            type: "string",
            required: true,
            description: "Plugin id to uninstall.",
          },
        ],
        exampleInvoke: { pluginId: "com.example.plugin" },
        returns: { type: "Promise<void>", description: "window.Nodex.uninstallPlugin" },
      },
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
      api: {
        summary: "Install a packaged plugin from the marketplace dist filename.",
        args: [
          {
            name: "packageFile",
            type: "string",
            required: true,
            description: "Basename or path key understood by window.Nodex.installMarketplacePlugin.",
          },
        ],
        exampleInvoke: { packageFile: "my-plugin.tgz" },
        returns: {
          type: "Promise<void>",
          description: "Resolves after install attempt; warnings may be surfaced in UI.",
        },
      },
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
      api: {
        summary: "Toggle the in-renderer REPL overlay.",
        args: [],
        exampleInvoke: {},
        returns: { type: "void", description: "Dispatches NODEX_REPL_TOGGLE_EVENT." },
      },
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
      api: {
        summary: `Toggle visibility of shell chrome: ${region}.`,
        args: [],
        exampleInvoke: {},
        returns: {
          type: "void",
          description: "Calls window.nodex.shell.layout.toggle(region) when DevTools shell API is mounted.",
        },
      },
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
    toggle("nodex.shell.toggle.menuRail", "Shell: Toggle activity bar", "menuRail"),
    toggle("nodex.shell.toggle.sidebarPanel", "Shell: Toggle sidebar", "sidebarPanel"),
    toggle("nodex.shell.toggle.secondaryArea", "Shell: Toggle companion", "secondaryArea"),
    toggle("nodex.shell.toggle.bottomDock", "Shell: Toggle bottom dock", "bottomArea"),
    toggle("nodex.shell.toggle.miniBar", "Shell: Toggle mini bar", "miniBar"),
    toggle("nodex.shell.toggle.modeLine", "Shell: Toggle mode line", "modeLine"),
  );

  // Minibuffer invokes registry commands only; mirror DevTools keymap API as commands.
  if (registries) {
    disposers.push(
      registry.registerCommand({
        id: "nodex.shell.keymap.register",
        title: "Shell: Register keyboard shortcut",
        category: "Shell",
        doc: "Same as window.nodex.shell.keymap.register. Args: { id, title, chord, commandId, commandArgs?, sourcePluginId?, ignoreWhenInput? }",
        api: {
          summary: "Register a key chord that invokes a command id with optional JSON args.",
          details:
            "Mirrors ShellKeyBinding: commandArgs is a plain object forwarded to invokeCommand.",
          args: [
            { name: "id", type: "string", required: true, description: "Unique binding id." },
            { name: "title", type: "string", required: true, description: "Shown in docs / keymap UI." },
            {
              name: "chord",
              type: "string",
              required: true,
              description: "Accelerator string, e.g. Ctrl+Shift+P.",
            },
            {
              name: "commandId",
              type: "string",
              required: true,
              description: "Registered command to run.",
            },
            {
              name: "commandArgs",
              type: "object",
              required: false,
              description: "Optional object passed as the second argument to the command handler.",
              schema: { type: "object", additionalProperties: true },
            },
            {
              name: "sourcePluginId",
              type: "string | null",
              required: false,
              description: "Owning plugin id for documentation.",
            },
            {
              name: "ignoreWhenInput",
              type: "boolean",
              required: false,
              description: "If true, skip when focus is in an editable field.",
            },
          ],
          exampleInvoke: {
            id: "user.docs.open",
            title: "Open docs",
            chord: "ctrl+shift+d",
            commandId: "nodex.docs.open",
            sourcePluginId: "user.script",
          },
          returns: { type: "void", description: "Registers into ShellKeymapRegistry." },
        },
        handler: (args) => {
          const a = args as Partial<ShellKeyBinding> | undefined;
          if (!a || typeof a !== "object") throw new Error("Missing args object.");
          if (typeof a.id !== "string" || typeof a.title !== "string" || typeof a.chord !== "string" || typeof a.commandId !== "string") {
            throw new Error("Args require id, title, chord, commandId (strings).");
          }
          registries.keymap.register({
            id: a.id,
            title: a.title,
            chord: a.chord,
            commandId: a.commandId,
            commandArgs:
              a.commandArgs && typeof a.commandArgs === "object" && !Array.isArray(a.commandArgs)
                ? (a.commandArgs as Record<string, unknown>)
                : undefined,
            sourcePluginId: typeof a.sourcePluginId === "string" ? a.sourcePluginId : null,
            ignoreWhenInput: typeof a.ignoreWhenInput === "boolean" ? a.ignoreWhenInput : undefined,
          });
        },
      }),
    );
  }

  return disposers;
}
