import { useEffect, useMemo } from "react";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import {
  JS_NOTEBOOK_PLUGIN_ID,
  jsNotebookOutputHtml,
  jsNotebookPrimaryHtml,
  jsNotebookSecondaryHtml,
  jsNotebookSidebarHtml,
} from "./jsNotebookViews";

const VIEW_SIDEBAR = "plugin.js-notebook.sidebar";
const VIEW_PRIMARY = "plugin.js-notebook.primary";
const VIEW_SECONDARY = "plugin.js-notebook.secondary";
const VIEW_OUTPUT = "plugin.js-notebook.output";
const TAB_NOTEBOOK = "plugin.js-notebook.tab";

export function useRegisterJsNotebookPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  const modeLineId = useMemo(() => `${JS_NOTEBOOK_PLUGIN_ID}.modeline`, []);

  useEffect(() => {
    const disposers: Array<() => void> = [];

    // Views (sandboxed iframe html)
    disposers.push(
      views.registerView({
        id: VIEW_SIDEBAR,
        title: "JS Notebook",
        defaultRegion: "primarySidebar",
        iframeHtml: jsNotebookSidebarHtml(),
        sandboxFlags: "allow-scripts",
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
      views.registerView({
        id: VIEW_PRIMARY,
        title: "JS Notebook",
        defaultRegion: "mainArea",
        iframeHtml: jsNotebookPrimaryHtml(),
        sandboxFlags: "allow-scripts",
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
      views.registerView({
        id: VIEW_SECONDARY,
        title: "JS Notebook (secondary)",
        defaultRegion: "secondaryArea",
        iframeHtml: jsNotebookSecondaryHtml(),
        sandboxFlags: "allow-scripts",
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
      views.registerView({
        id: VIEW_OUTPUT,
        title: "Notebook output",
        defaultRegion: "bottomArea",
        iframeHtml: jsNotebookOutputHtml(),
        sandboxFlags: "allow-scripts",
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    // Menu rail entry (opens sidebar panel body)
    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.js-notebook.rail",
        title: "JS Notebook",
        icon: "JS",
        order: 10,
        openViewId: VIEW_SIDEBAR,
      }),
    );

    // Panel menu entry (for sidebar panel when notebook view is open)
    disposers.push(
      regs.panelMenu.registerItems([
        {
          id: "plugin.js-notebook.panel.openPrimary",
          title: "Open in primary",
          region: "primarySidebar",
          viewId: VIEW_SIDEBAR,
          order: 0,
          commandId: "nodex.jsNotebook.openPrimary",
        },
        {
          id: "plugin.js-notebook.panel.openSecondary",
          title: "Open in secondary",
          region: "primarySidebar",
          viewId: VIEW_SIDEBAR,
          order: 1,
          commandId: "nodex.jsNotebook.openSecondary",
        },
      ]),
    );

    // Primary tab type (so it works in the primary area)
    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_NOTEBOOK,
        title: "JS Notebook",
        order: 10,
        viewId: VIEW_PRIMARY,
      }),
    );

    // Commands (so palette / minibar can install/open it)
    disposers.push(
      contrib.registerCommand({
        id: "nodex.jsNotebook.openPrimary",
        title: "JS Notebook: Open in primary",
        category: "Notebook",
        sourcePluginId: JS_NOTEBOOK_PLUGIN_ID,
        doc: "Open the JS notebook tab in the primary area.",
        handler: () => {
          regs.tabs.openTab(TAB_NOTEBOOK, "JS Notebook");
        },
      }),
      contrib.registerCommand({
        id: "nodex.jsNotebook.openSidebarPanel",
        title: "JS Notebook: Open sidebar panel",
        category: "Notebook",
        sourcePluginId: JS_NOTEBOOK_PLUGIN_ID,
        handler: () => views.openView(VIEW_SIDEBAR, "primarySidebar"),
      }),
      contrib.registerCommand({
        id: "nodex.jsNotebook.openSecondary",
        title: "JS Notebook: Open in secondary",
        category: "Notebook",
        sourcePluginId: JS_NOTEBOOK_PLUGIN_ID,
        handler: () => views.openView(VIEW_SECONDARY, "secondaryArea"),
      }),
      contrib.registerCommand({
        id: "nodex.jsNotebook.openOutput",
        title: "JS Notebook: Open output dock",
        category: "Notebook",
        sourcePluginId: JS_NOTEBOOK_PLUGIN_ID,
        handler: () => views.openView(VIEW_OUTPUT, "bottomArea"),
      }),
    );

    // Modeline segment: show when notebook tab is active.
    let disposeModeLine: (() => void) | null = null;
    const updateModeLine = () => {
      const active = regs.tabs.getActiveTab();
      const on = active?.tabTypeId === TAB_NOTEBOOK;
      if (!on) {
        if (disposeModeLine) {
          disposeModeLine();
          disposeModeLine = null;
        }
        return;
      }
      if (!disposeModeLine) {
        disposeModeLine = contrib.registerModeLineItem({
          id: modeLineId,
          segment: "plugin.primary",
          priority: 50,
          text: "js-notebook",
          sourcePluginId: JS_NOTEBOOK_PLUGIN_ID,
        });
      }
    };
    updateModeLine();
    const unsubTabs = regs.tabs.subscribe(() => updateModeLine());

    return () => {
      unsubTabs();
      if (disposeModeLine) disposeModeLine();
      for (const d of disposers) d();
    };
  }, [contrib, modeLineId, regs, views]);
}

