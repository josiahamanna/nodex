import type { ShellMenuRailItem } from "./registries/ShellMenuRailRegistry";
import type { ShellTabsRegistry } from "./registries/ShellTabsRegistry";
import type { ShellViewRegistry } from "./views/ShellViewRegistry";
import type { ShellLayoutStore } from "./layout/ShellLayoutStore";

export type ShellNavigationDeps = {
  tabs: ShellTabsRegistry;
  views: ShellViewRegistry;
  layout: ShellLayoutStore;
};

/**
 * Single implementation for menu rail clicks (and mirrors command handlers where needed).
 */
export function runShellMenuRailAction(
  item: ShellMenuRailItem,
  deps: ShellNavigationDeps,
  invokeCommand: (commandId: string, args?: Record<string, unknown>) => unknown,
): void {
  if (item.commandId) {
    void Promise.resolve(invokeCommand(item.commandId, item.commandArgs));
    return;
  }
  if (item.tabTypeId) {
    deps.tabs.openOrReuseTab(item.tabTypeId, {
      title: item.title,
      reuseKey: item.tabReuseKey ?? `rail:${item.id}`,
    });
    const ex = item.expandChrome;
    if (ex?.menuRail) deps.layout.setVisible("menuRail", true);
    if (ex?.sidebarPanel) deps.layout.setVisible("sidebarPanel", true);
    if (ex?.secondaryArea) deps.layout.setVisible("secondaryArea", true);
    if (item.sidebarViewId) {
      deps.views.openView(item.sidebarViewId, "primarySidebar");
      deps.layout.setVisible("menuRail", true);
      deps.layout.setVisible("sidebarPanel", true);
    }
    if (item.secondaryViewId) {
      deps.views.openView(item.secondaryViewId, "secondaryArea");
      deps.layout.setVisible("secondaryArea", true);
    }
    return;
  }
  if (item.openViewId) {
    deps.views.openView(item.openViewId, item.openViewRegion ?? "primarySidebar");
    deps.layout.setVisible("menuRail", true);
    deps.layout.setVisible("sidebarPanel", true);
  }
}
