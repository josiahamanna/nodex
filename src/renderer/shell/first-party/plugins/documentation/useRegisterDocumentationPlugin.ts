import { useEffect } from "react";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { DOCS_PLUGIN_ID } from "./documentationConstants";
import { DocumentationHubView } from "./DocumentationHubView";
import { DocumentationSearchPanelView } from "./DocumentationSearchPanelView";
import { DocumentationSettingsPanelView } from "./DocumentationSettingsPanelView";

const VIEW_DOCS_SEARCH = "plugin.documentation.search";
const VIEW_DOCS_SETTINGS = "plugin.documentation.settings";
const VIEW_DOCS_HUB = "plugin.documentation.hub";
const TAB_DOCS = "plugin.documentation.tab";

function openDocsLayout(views: ReturnType<typeof useShellViewRegistry>): void {
  views.openView(VIEW_DOCS_SEARCH, "primarySidebar");
  views.openView(VIEW_DOCS_SETTINGS, "secondaryArea");
  views.openView(VIEW_DOCS_HUB, "mainArea");
}

export function useRegisterDocumentationPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_DOCS_SEARCH,
        title: "Docs — search",
        defaultRegion: "primarySidebar",
        component: DocumentationSearchPanelView,
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
      views.registerView({
        id: VIEW_DOCS_SETTINGS,
        title: "Docs — settings",
        defaultRegion: "secondaryArea",
        component: DocumentationSettingsPanelView,
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
      views.registerView({
        id: VIEW_DOCS_HUB,
        title: "Documentation",
        defaultRegion: "mainArea",
        component: DocumentationHubView,
        capabilities: { allowedCommands: [], readContext: false },
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.documentation.rail",
        title: "Documentation",
        icon: "?",
        order: 20,
        tabTypeId: TAB_DOCS,
        sidebarViewId: VIEW_DOCS_SEARCH,
        secondaryViewId: VIEW_DOCS_SETTINGS,
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_DOCS,
        title: "Docs",
        order: 20,
        viewId: VIEW_DOCS_HUB,
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.docs.open",
        title: "Docs: Open documentation",
        category: "Docs",
        sourcePluginId: DOCS_PLUGIN_ID,
        doc: "Opens Documentation: search in sidebar panel, settings in secondary area.",
        api: {
          summary: "Open the Documentation workspace (new Docs tab, sidebar search, secondary settings).",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "Updates tabs and ShellViewRegistry regions." },
        },
        handler: () => {
          regs.tabs.openTab(TAB_DOCS, "Docs");
          openDocsLayout(views);
        },
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.docs.about",
        title: "Docs: What is Documentation?",
        category: "Docs",
        sourcePluginId: DOCS_PLUGIN_ID,
        doc: "Opens the Documentation layout (search + settings).",
        api: {
          summary: "Same layout as nodex.docs.open; alias for discoverability.",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "Opens Documentation shell layout." },
        },
        handler: () => {
          regs.tabs.openTab(TAB_DOCS, "Docs");
          openDocsLayout(views);
        },
      }),
    );

    const unsub = regs.tabs.subscribe(() => {
      const a = regs.tabs.getActiveTab();
      if (a?.tabTypeId === TAB_DOCS) {
        openDocsLayout(views);
      }
    });

    return () => {
      unsub();
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}
