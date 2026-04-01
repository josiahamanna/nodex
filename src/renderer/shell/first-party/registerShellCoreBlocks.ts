import { useEffect } from "react";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../views/ShellViewContext";

/**
 * Minimal first-party “core blocks” registered through the same registries as plugins.
 * This is a placeholder until plugins can register themselves through a loader.
 */
export function useRegisterShellCoreBlocks(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    // Views
    disposers.push(
      views.registerView({
        id: "shell.welcome",
        title: "Welcome",
        defaultRegion: "mainArea",
        iframeHtml: `<div style="font-family: ui-sans-serif, system-ui; padding: 16px;">
          <h2>Welcome</h2>
          <p>This is a sandboxed view. Use DevTools: <code>window.nodex.shell</code></p>
          <p>Try registering menu items and tabs from DevTools.</p>
        </div>`,
        sandboxFlags: "allow-scripts",
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    // Menu rail defaults
    disposers.push(
      regs.menuRail.registerItem({
        id: "shell.rail.welcome",
        title: "Welcome",
        icon: "N",
        order: 0,
        openViewId: "shell.welcome",
      }),
    );

    // Tabs default
    disposers.push(
      regs.tabs.registerTabType({
        id: "shell.tab.welcome",
        title: "Welcome",
        order: 0,
        viewId: "shell.welcome",
      }),
    );
    regs.tabs.openTab("shell.tab.welcome", "Welcome");

    // App menu defaults (hierarchy)
    disposers.push(
      regs.appMenu.registerItems([
        {
          id: "shell.menu.shell",
          title: "Shell",
          order: 0,
          children: [
            { id: "shell.menu.shell.palette", title: "Command palette", commandId: "nodex.shell.openPalette" },
            { id: "shell.menu.shell.minibuffer", title: "Mini buffer (M-x)", commandId: "nodex.shell.openMiniBar" },
            { id: "shell.menu.shell.toggleSidebar", title: "Toggle sidebar", commandId: "nodex.shell.toggle.sidebarPanel" },
            { id: "shell.menu.shell.toggleSecondary", title: "Toggle secondary", commandId: "nodex.shell.toggle.secondaryArea" },
            { id: "shell.menu.shell.toggleBottom", title: "Toggle bottom dock", commandId: "nodex.shell.toggle.bottomDock" },
          ],
        },
      ]),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [regs, views]);
}

