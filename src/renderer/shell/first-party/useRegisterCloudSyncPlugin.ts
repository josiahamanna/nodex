import { useEffect } from "react";
import { useNodexContributionRegistry } from "../NodexContributionContext";
import { useShellLayoutStore } from "../layout/ShellLayoutContext";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../views/ShellViewContext";
import { CloudSyncMainView } from "./cloud-sync/CloudSyncMainView";
import { CloudSyncSidebarView } from "./cloud-sync/CloudSyncSidebarView";

const CLOUD_PLUGIN_ID = "shell.cloud";
const VIEW_CLOUD_SIDEBAR = "shell.cloud.sidebar";
const VIEW_CLOUD_MAIN = "shell.cloud.main";
const TAB_CLOUD = "shell.tab.cloud";

export function useRegisterCloudSyncPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const layout = useShellLayoutStore();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_CLOUD_SIDEBAR,
        title: "Cloud notes",
        defaultRegion: "primarySidebar",
        component: CloudSyncSidebarView,
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
      views.registerView({
        id: VIEW_CLOUD_MAIN,
        title: "Cloud sync",
        defaultRegion: "mainArea",
        component: CloudSyncMainView,
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "shell.cloud.rail",
        title: "Cloud",
        icon: "☁",
        order: 22,
        tabTypeId: TAB_CLOUD,
        tabReuseKey: "shell.cloud",
        sidebarViewId: VIEW_CLOUD_SIDEBAR,
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_CLOUD,
        title: "Cloud",
        order: 22,
        viewId: VIEW_CLOUD_MAIN,
        primarySidebarViewId: VIEW_CLOUD_SIDEBAR,
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.cloud.open",
        title: "Cloud: Open sync panel",
        category: "Cloud",
        sourcePluginId: CLOUD_PLUGIN_ID,
        doc: "Opens the Mongo-backed cloud notes tab (Fastify sync API).",
        api: {
          summary: "Focus Cloud rail tab.",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "Opens or focuses Cloud tab." },
        },
        handler: () => {
          regs.tabs.openOrReuseTab(TAB_CLOUD, {
            title: "Cloud",
            reuseKey: "shell.cloud",
          });
          layout.setVisible("menuRail", true);
        },
      }),
    );

    return () => {
      for (const d of disposers) {
        d();
      }
    };
  }, [contrib, layout, regs, views]);
}
