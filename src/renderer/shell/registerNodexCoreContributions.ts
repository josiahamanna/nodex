import type { NodexContributionRegistry } from "./nodex-contribution-registry";
import type { ShellRegistries } from "./registries/ShellRegistriesContext";
import type { ShellKeyBinding } from "./registries/ShellKeymapRegistry";
import {
  runClearAllDev,
  runClearDbDev,
  runClearUiDev,
} from "../dev/clear-local-dev-state";
import { emitNodexMinibarOutput } from "./minibarEcho";
import { NODEX_REPL_TOGGLE_EVENT } from "./NodexReplOverlay";
import { closeShellTabInstance } from "./shellTabClose";

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
      title: "Plugins: List installed",
      category: "Plugins",
      doc: "Lists installed plugin ids in the minibuffer (and console).",
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
          const body = ids.length ? ids.map((id) => `  ${id}`).join("\n") : "  (none)";
          emitNodexMinibarOutput(`Installed plugins (${ids.length}):\n${body}`);
          setTransientStatus(`Installed plugins: ${ids.length}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Failed to list plugins";
          emitNodexMinibarOutput(msg, "error");
          setTransientStatus(msg, 4500);
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
        emitNodexMinibarOutput("Reloading plugins…");
        const r = await window.Nodex.reloadPluginRegistry();
        if (r.success) {
          emitNodexMinibarOutput("Plugins reloaded.");
          setTransientStatus("Plugins reloaded.");
        } else {
          const msg = r.error ?? "Plugin reload failed";
          emitNodexMinibarOutput(msg, "error");
          setTransientStatus(msg, 4500);
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
          const hint = `Missing args.pluginId.\n\nExample:\n  ${enabled ? "nodex.plugins.enable" : "nodex.plugins.disable"} {"pluginId":"your.plugin.id"}`;
          emitNodexMinibarOutput(hint, "error");
          setTransientStatus("Missing args.pluginId", 4500);
          return;
        }
        setTransientStatus(
          enabled ? `Enabling ${pluginId}…` : `Disabling ${pluginId}…`,
          1500,
        );
        emitNodexMinibarOutput(
          enabled ? `Enabling ${pluginId}…` : `Disabling ${pluginId}…`,
        );
        const r = await window.Nodex.setPluginEnabled(pluginId, enabled);
        if (r.success) {
          emitNodexMinibarOutput(enabled ? `Enabled: ${pluginId}` : `Disabled: ${pluginId}`);
          setTransientStatus(enabled ? "Enabled." : "Disabled.");
        } else {
          const msg = r.error ?? "Plugin toggle failed";
          emitNodexMinibarOutput(msg, "error");
          setTransientStatus(msg, 4500);
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
          const hint =
            'Missing args.pluginId.\n\nExample:\n  nodex.plugins.uninstall {"pluginId":"your.plugin.id"}';
          emitNodexMinibarOutput(hint, "error");
          setTransientStatus("Missing args.pluginId", 4500);
          return;
        }
        setTransientStatus(`Uninstalling ${pluginId}…`, 1500);
        emitNodexMinibarOutput(`Uninstalling ${pluginId}…`);
        const r = await window.Nodex.uninstallPlugin(pluginId);
        if (r.success) {
          emitNodexMinibarOutput(`Uninstalled: ${pluginId}`);
          setTransientStatus("Uninstalled.");
        } else {
          const msg = r.error ?? "Uninstall failed";
          emitNodexMinibarOutput(msg, "error");
          setTransientStatus(msg, 4500);
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
          const hint =
            'Missing args.packageFile.\n\nExample:\n  nodex.plugins.installMarketplace {"packageFile":"my-plugin.tgz"}';
          emitNodexMinibarOutput(hint, "error");
          setTransientStatus("Missing args.packageFile", 4500);
          return;
        }
        setTransientStatus(`Installing ${packageFile}…`, 1500);
        emitNodexMinibarOutput(`Installing ${packageFile}…`);
        const r = await window.Nodex.installMarketplacePlugin(packageFile);
        if (r.success) {
          const w =
            r.warnings?.length && r.warnings.length > 0
              ? `\n\nWarnings (${r.warnings.length}):\n${r.warnings.map((x) => `  ${String(x)}`).join("\n")}`
              : "";
          emitNodexMinibarOutput(`Installed: ${packageFile}${w}`);
          const st =
            r.warnings?.length && r.warnings.length > 0
              ? ` (${r.warnings.length} warning(s))`
              : "";
          setTransientStatus(`Installed.${st}`);
        } else {
          const msg = r.error ?? "Install failed";
          emitNodexMinibarOutput(msg, "error");
          setTransientStatus(msg, 4500);
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
    toggle("nodex.shell.toggle.sidebarPanel", "Shell: Toggle side panel", "sidebarPanel"),
    toggle("nodex.shell.toggle.companion", "Shell: Toggle companion", "companion"),
    toggle("nodex.shell.toggle.bottomDock", "Shell: Toggle bottom dock", "bottomArea"),
    toggle("nodex.shell.toggle.miniBar", "Shell: Toggle mini bar", "miniBar"),
    toggle("nodex.shell.toggle.modeLine", "Shell: Toggle mode line", "modeLine"),
  );

  // Minibuffer invokes registry commands only; mirror DevTools keymap API as commands.
  if (registries) {
    disposers.push(
      registry.registerCommand({
        id: "nodex.shell.closeActiveTab",
        title: "Shell: Close active tab",
        category: "Shell",
        doc: "Closes the selected main-area tab. When none remain, Welcome is opened again.",
        api: {
          summary: "Same behavior as the × button on the tab strip.",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "Updates ShellTabsRegistry." },
        },
        handler: () => {
          const active = registries.tabs.getActiveTab();
          if (!active) return;
          closeShellTabInstance(registries.tabs, active.instanceId);
        },
      }),
    );

    disposers.push(
      registry.registerCommand({
        id: "nodex.devtools.tabs.listOpen",
        title: "Devtools: List open shell tabs (log)",
        category: "Nodex",
        sourcePluginId: null,
        palette: process.env.NODE_ENV !== "production",
        miniBar: true,
        doc: "Logs ShellTabsRegistry.listOpenTabs() to the browser console.",
        api: {
          summary: "Development helper: log all open shell tabs.",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "console.table (or console.info) output." },
        },
        handler: () => {
          const list = registries.tabs.listOpenTabs();
          // eslint-disable-next-line no-console
          if (typeof console.table === "function") console.table(list);
          // eslint-disable-next-line no-console
          else console.info("[Nodex] Open shell tabs:", list);
        },
      }),
    );

    disposers.push(
      registry.registerCommand({
        id: "nodex.devtools.tabs.active",
        title: "Devtools: Log active shell tab",
        category: "Nodex",
        sourcePluginId: null,
        palette: process.env.NODE_ENV !== "production",
        miniBar: true,
        doc: "Logs ShellTabsRegistry.getActiveTab() to the browser console.",
        api: {
          summary: "Development helper: log active tab instance.",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "console.info output." },
        },
        handler: () => {
          const active = registries.tabs.getActiveTab();
          // eslint-disable-next-line no-console
          console.info("[Nodex] Active tab:", active);
        },
      }),
    );

    disposers.push(
      registry.registerCommand({
        id: "nodex.devtools.tabs.close",
        title: "Devtools: Close shell tab",
        category: "Nodex",
        sourcePluginId: null,
        palette: process.env.NODE_ENV !== "production",
        miniBar: true,
        doc: 'Closes a tab instance. Args: { instanceId: "..." }',
        api: {
          summary: "Close a shell tab by instance id.",
          args: [{ name: "instanceId", type: "string", required: true, description: "Tab instance id." }],
          exampleInvoke: { instanceId: "shell.tab.welcome:..." },
          returns: { type: "void", description: "Updates ShellTabsRegistry." },
        },
        handler: (args) => {
          const a = args as { instanceId?: unknown } | undefined;
          const instanceId = a?.instanceId;
          if (typeof instanceId !== "string" || !instanceId.trim()) {
            throw new Error('Missing args.instanceId (string). Example: {"instanceId":"..."}');
          }
          registries.tabs.closeTab(instanceId.trim());
        },
      }),
    );

    disposers.push(
      registry.registerCommand({
        id: "nodex.devtools.tabs.setActive",
        title: "Devtools: Activate shell tab",
        category: "Nodex",
        sourcePluginId: null,
        palette: process.env.NODE_ENV !== "production",
        miniBar: true,
        doc: 'Activates a tab instance. Args: { instanceId: "..." }',
        api: {
          summary: "Activate a shell tab by instance id.",
          args: [{ name: "instanceId", type: "string", required: true, description: "Tab instance id." }],
          exampleInvoke: { instanceId: "shell.tab.welcome:..." },
          returns: { type: "void", description: "Updates ShellTabsRegistry." },
        },
        handler: (args) => {
          const a = args as { instanceId?: unknown } | undefined;
          const instanceId = a?.instanceId;
          if (typeof instanceId !== "string" || !instanceId.trim()) {
            throw new Error('Missing args.instanceId (string). Example: {"instanceId":"..."}');
          }
          registries.tabs.setActiveTab(instanceId.trim());
        },
      }),
    );

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

  disposers.push(
    registry.registerCommand({
      id: "nodex.dev.clearUi",
      title: "Dev: Clear UI session (localStorage, caches, reload)",
      category: "Nodex",
      sourcePluginId: null,
      palette: true,
      miniBar: true,
      doc: "Clears Nodex local/session storage, Cache Storage, and unregisters service workers, then reloads. Does not delete IndexedDB databases.",
      api: {
        summary: "Clear browser UI session and frontend caches; reload the page.",
        args: [
          {
            name: "confirm",
            type: "boolean",
            required: false,
            description: "If true, skip the confirmation dialog.",
          },
        ],
        exampleInvoke: { confirm: true },
        returns: { type: "Promise<void>", description: "Reloads the window." },
      },
      handler: async (args) => {
        const skip =
          args &&
          typeof args === "object" &&
          (args as { confirm?: unknown }).confirm === true;
        if (
          !skip &&
          typeof window !== "undefined" &&
          !window.confirm(
            "Clear UI session (localStorage, session storage, caches) and reload? IndexedDB is kept.",
          )
        ) {
          return;
        }
        setTransientStatus("Clearing UI…", 2000);
        await runClearUiDev();
      },
    }),
  );

  disposers.push(
    registry.registerCommand({
      id: "nodex.dev.clearDb",
      title: "Dev: Clear local DB (IndexedDB RxDB + scratch WPN, reload)",
      category: "Nodex",
      sourcePluginId: null,
      palette: true,
      miniBar: true,
      doc: "Deletes cloud-notes RxDB and browser-local WPN scratch IndexedDB, then reloads.",
      api: {
        summary: "Clear IndexedDB databases used by Nodex in this browser profile.",
        args: [
          {
            name: "confirm",
            type: "boolean",
            required: false,
            description: "If true, skip the confirmation dialog.",
          },
        ],
        exampleInvoke: { confirm: true },
        returns: { type: "Promise<void>", description: "Reloads the window." },
      },
      handler: async (args) => {
        const skip =
          args &&
          typeof args === "object" &&
          (args as { confirm?: unknown }).confirm === true;
        if (
          !skip &&
          typeof window !== "undefined" &&
          !window.confirm(
            "Delete local IndexedDB data (RxDB cloud notes + scratch WPN) and reload? UI session storage is kept.",
          )
        ) {
          return;
        }
        setTransientStatus("Clearing local DB…", 2000);
        await runClearDbDev();
      },
    }),
  );

  disposers.push(
    registry.registerCommand({
      id: "nodex.dev.clearAll",
      title: "Dev: Clear UI + local DB (full local reset, reload)",
      category: "Nodex",
      sourcePluginId: null,
      palette: true,
      miniBar: true,
      doc: "Runs clear-db then clear-ui: removes IndexedDB and session/cache state, then reloads.",
      api: {
        summary: "Full local reset: IndexedDB + UI session/caches, then reload.",
        args: [
          {
            name: "confirm",
            type: "boolean",
            required: false,
            description: "If true, skip the confirmation dialog.",
          },
        ],
        exampleInvoke: { confirm: true },
        returns: { type: "Promise<void>", description: "Reloads the window." },
      },
      handler: async (args) => {
        const skip =
          args &&
          typeof args === "object" &&
          (args as { confirm?: unknown }).confirm === true;
        if (
          !skip &&
          typeof window !== "undefined" &&
          !window.confirm(
            "Full local reset: delete IndexedDB (notes DBs) AND clear session/caches, then reload?",
          )
        ) {
          return;
        }
        setTransientStatus("Clearing all local data…", 2000);
        await runClearAllDev();
      },
    }),
  );

  return disposers;
}
