import type { NodexContributionRegistry } from "./nodex-contribution-registry";
import type { ShellLayoutStore } from "./layout/ShellLayoutStore";
import type { ShellRegionId } from "./layout/ShellLayoutState";
import type { ShellViewRegistry } from "./views/ShellViewRegistry";
import type { ShellRegistries } from "./registries/ShellRegistriesContext";

declare global {
  interface Window {
    nodex?: {
      shell?: unknown;
    };
  }
}

export function exposeDevtoolsShellApi(opts: {
  registry: NodexContributionRegistry;
  layout: ShellLayoutStore;
  views?: ShellViewRegistry;
  registries?: ShellRegistries;
}): void {
  if (typeof window === "undefined") return;
  const { registry, layout } = opts;

  window.nodex = window.nodex ?? {};
  window.nodex.shell = {
    layout: {
      get: () => layout.get(),
      setVisible: (regionId: ShellRegionId, visible: boolean) =>
        layout.setVisible(regionId, Boolean(visible)),
      toggle: (regionId: ShellRegionId) => layout.toggle(regionId),
      apply: (patch: Partial<ReturnType<typeof layout.get>>) =>
        layout.patch((cur) => ({ ...cur, ...(patch as object) })),
    },
    commands: {
      list: () => registry.listCommands(),
      invoke: (commandId: string, args?: Record<string, unknown>) =>
        registry.invokeCommand(String(commandId), args),
    },
    views: opts.views
      ? {
          list: () => opts.views!.listViews(),
          register: (v: Parameters<ShellViewRegistry["registerView"]>[0]) =>
            opts.views!.registerView(v),
          open: (viewId: string, regionId?: Parameters<ShellViewRegistry["openView"]>[1]) =>
            opts.views!.openView(viewId, regionId),
          closeRegion: (regionId: Parameters<ShellViewRegistry["closeRegion"]>[0]) =>
            opts.views!.closeRegion(regionId),
        }
      : undefined,
    appMenu: opts.registries
      ? {
          list: () => opts.registries!.appMenu.list(),
          registerItems: (items: Parameters<ShellRegistries["appMenu"]["registerItems"]>[0]) =>
            opts.registries!.appMenu.registerItems(items),
        }
      : undefined,
    menuRail: opts.registries
      ? {
          list: () => opts.registries!.menuRail.list(),
          registerItem: (item: Parameters<ShellRegistries["menuRail"]["registerItem"]>[0]) =>
            opts.registries!.menuRail.registerItem(item),
        }
      : undefined,
    tabs: opts.registries
      ? {
          listTypes: () => opts.registries!.tabs.listTabTypes(),
          registerType: (t: Parameters<ShellRegistries["tabs"]["registerTabType"]>[0]) =>
            opts.registries!.tabs.registerTabType(t),
          open: (tabTypeId: string, title?: string, state?: unknown) =>
            opts.registries!.tabs.openTab(String(tabTypeId), title, state),
          listOpen: () => opts.registries!.tabs.listOpenTabs(),
          setActive: (instanceId: string) => opts.registries!.tabs.setActiveTab(String(instanceId)),
          close: (instanceId: string) => opts.registries!.tabs.closeTab(String(instanceId)),
        }
      : undefined,
  };
}

