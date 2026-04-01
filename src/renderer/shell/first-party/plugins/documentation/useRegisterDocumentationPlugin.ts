import { useEffect } from "react";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import {
  DOCS_PLUGIN_ID,
  documentationHubHtml,
  documentationSearchPanelHtml,
  documentationSettingsPanelHtml,
} from "./documentationViews";

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
        iframeHtml: documentationSearchPanelHtml(),
        sandboxFlags: "allow-scripts allow-same-origin",
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
      views.registerView({
        id: VIEW_DOCS_SETTINGS,
        title: "Docs — settings",
        defaultRegion: "secondaryArea",
        iframeHtml: documentationSettingsPanelHtml(),
        sandboxFlags: "allow-scripts allow-same-origin",
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
      views.registerView({
        id: VIEW_DOCS_HUB,
        title: "Documentation",
        defaultRegion: "mainArea",
        iframeHtml: documentationHubHtml(),
        sandboxFlags: "allow-scripts",
        capabilities: { allowedCommands: [], readContext: false },
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.documentation.rail",
        title: "Documentation",
        icon: "?",
        order: 20,
        commandId: "nodex.docs.open",
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
