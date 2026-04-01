import { useEffect } from "react";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../views/ShellViewContext";
import { WelcomeShellView } from "./WelcomeShellView";
import { NOTES_EXPLORER_VIEW_SIDEBAR } from "./shellWorkspaceIds";

/**
 * Minimal first-party shell blocks (React views, no iframes).
 */
export function useRegisterShellCoreBlocks(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: "shell.welcome",
        title: "Welcome",
        defaultRegion: "mainArea",
        component: WelcomeShellView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "shell.rail.welcome",
        title: "Welcome",
        icon: "N",
        order: 0,
        tabTypeId: "shell.tab.welcome",
        tabReuseKey: "shell:welcome",
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: "shell.tab.welcome",
        title: "Welcome",
        order: 0,
        viewId: "shell.welcome",
        primarySidebarViewId: NOTES_EXPLORER_VIEW_SIDEBAR,
      }),
    );
    regs.tabs.openOrReuseTab("shell.tab.welcome", {
      title: "Welcome",
      reuseKey: "shell:welcome",
    });

    disposers.push(
      regs.appMenu.registerItems([
        {
          id: "shell.menu.shell",
          title: "Shell",
          order: 0,
          children: [
            { id: "shell.menu.shell.palette", title: "Command palette", commandId: "nodex.shell.openPalette" },
            { id: "shell.menu.shell.minibuffer", title: "Mini buffer (M-x)", commandId: "nodex.shell.openMiniBar" },
            { id: "shell.menu.shell.toggleActivityBar", title: "Toggle activity bar", commandId: "nodex.shell.toggle.menuRail" },
            { id: "shell.menu.shell.toggleSidebar", title: "Toggle sidebar", commandId: "nodex.shell.toggle.sidebarPanel" },
            { id: "shell.menu.shell.toggleSecondary", title: "Toggle companion", commandId: "nodex.shell.toggle.secondaryArea" },
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
