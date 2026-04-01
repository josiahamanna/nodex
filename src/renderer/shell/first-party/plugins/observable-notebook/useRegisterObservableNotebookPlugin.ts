import { useEffect } from "react";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { ObservableNotebookShellView } from "./ObservableNotebookShellView";

export const OBSERVABLE_NOTEBOOK_PLUGIN_ID = "plugin.observable-notebook";

const VIEW_PRIMARY = "plugin.observable-notebook.primary";
const TAB_NOTEBOOK = "plugin.observable-notebook.tab";

export function useRegisterObservableNotebookPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
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
        commandId: "nodex.observableNotebook.open",
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.observableNotebook.open",
        title: "Observable: Open notebook",
        category: "Notebook",
        sourcePluginId: OBSERVABLE_NOTEBOOK_PLUGIN_ID,
        doc: "Open the Observable notebook tab in the primary area.",
        handler: () => {
          regs.tabs.openTab(TAB_NOTEBOOK, "Observable");
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}
