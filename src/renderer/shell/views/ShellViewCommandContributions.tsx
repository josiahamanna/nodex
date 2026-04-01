import React, { useEffect } from "react";
import { useNodexContributionRegistry } from "../NodexContributionContext";
import { useShellViewRegistry } from "./ShellViewContext";

/**
 * Registers shell view commands that need access to the view registry.
 * Keeps `registerNodexCoreContributions` pure and non-React.
 */
export function ShellViewCommandContributions(): null {
  const commands = useNodexContributionRegistry();
  const views = useShellViewRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      commands.registerCommand({
        id: "nodex.shell.views.list",
        title: "Shell: List registered views (log)",
        category: "Shell",
        doc: "Logs registered shell views to the console.",
        handler: () => {
          // eslint-disable-next-line no-console
          console.info("[Nodex] Shell views:", views.listViews());
        },
      }),
    );

    disposers.push(
      commands.registerCommand({
        id: "nodex.shell.openView",
        title: "Shell: Open view…",
        category: "Shell",
        doc: "Open a view by id. args: { viewId, regionId? }",
        handler: (args) => {
          const viewId = String(args?.viewId ?? "").trim();
          const regionIdRaw = String(args?.regionId ?? "").trim();
          if (!viewId) {
            throw new Error("Missing args.viewId");
          }
          const regionId =
            regionIdRaw === "primarySidebar" ||
            regionIdRaw === "mainArea" ||
            regionIdRaw === "secondaryArea" ||
            regionIdRaw === "bottomArea"
              ? regionIdRaw
              : undefined;
          views.openView(viewId, regionId);
        },
      }),
    );

    disposers.push(
      commands.registerCommand({
        id: "nodex.shell.closeRegion",
        title: "Shell: Close region view…",
        category: "Shell",
        doc: "Close the currently open view in a region. args: { regionId }",
        handler: (args) => {
          const regionIdRaw = String(args?.regionId ?? "").trim();
          if (
            regionIdRaw !== "primarySidebar" &&
            regionIdRaw !== "mainArea" &&
            regionIdRaw !== "secondaryArea" &&
            regionIdRaw !== "bottomArea"
          ) {
            throw new Error("Invalid args.regionId");
          }
          views.closeRegion(regionIdRaw);
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [commands, views]);

  return null;
}

