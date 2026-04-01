import { useEffect } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { useShellLayoutStore } from "../../../layout/ShellLayoutContext";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { ObservableNotebookShellView } from "./ObservableNotebookShellView";

export const OBSERVABLE_NOTEBOOK_PLUGIN_ID = "plugin.observable-notebook";

const VIEW_PRIMARY = "plugin.observable-notebook.primary";
const TAB_NOTEBOOK = "plugin.observable-notebook.tab";

export function useRegisterObservableNotebookPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const layout = useShellLayoutStore();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_PRIMARY,
        title: "Observable Notebook",
        defaultRegion: "mainArea",
        component: ObservableNotebookShellView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_NOTEBOOK,
        title: "Observable",
        order: 9,
        viewId: VIEW_PRIMARY,
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.observable-notebook.rail",
        title: "Observable",
        icon: "O",
        order: 9,
        tabTypeId: TAB_NOTEBOOK,
        tabReuseKey: "plugin.observable-notebook",
        expandChrome: { menuRail: true, sidebarPanel: true },
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.observableNotebook.open",
        title: "Observable: Open notebook",
        category: "Notebook",
        sourcePluginId: OBSERVABLE_NOTEBOOK_PLUGIN_ID,
        doc: "Open the Observable notebook tab in the primary area.",
        api: {
          summary: "Open a new Observable notebook tab and focus it in the main column.",
          args: [],
          exampleInvoke: {},
          returns: {
            type: "void",
            description: "Registers a new ShellTabsRegistry instance for plugin.observable-notebook.tab.",
          },
        },
        handler: () => {
          layout.setVisible("menuRail", true);
          layout.setVisible("sidebarPanel", true);
          const inst = regs.tabs.openOrReuseTab(TAB_NOTEBOOK, {
            title: "Observable",
            reuseKey: "plugin.observable-notebook",
          });
          const vid = regs.tabs.resolveViewForInstance(inst.instanceId);
          if (vid) views.openView(vid, "mainArea");
        },
      }),
    );

    const syncObservableMain = () => {
      const a = regs.tabs.getActiveTab();
      if (a?.tabTypeId === TAB_NOTEBOOK) {
        views.openView(VIEW_PRIMARY, "mainArea");
      }
    };
    const unsubTabs = regs.tabs.subscribe(syncObservableMain);
    syncObservableMain();

    return () => {
      unsubTabs();
      for (const d of disposers) d();
    };
  }, [contrib, layout, regs, views]);
}
