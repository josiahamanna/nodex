import React from "react";
import type { ShellTabInstance } from "../registries/ShellTabsRegistry";
import { ShellActiveMainTabProvider } from "../ShellActiveTabContext";
import type { ShellViewDescriptor } from "./ShellViewRegistry";

/**
 * Mounts a shell view as a React subtree (no iframe).
 */
export function ShellViewHost({
  view,
  activeMainTab = undefined,
}: {
  view: ShellViewDescriptor;
  /** When provided, exposes the active main-column tab to the view subtree. */
  activeMainTab?: ShellTabInstance | null;
}): React.ReactElement {
  const C = view.component;
  const caps = view.capabilities ?? {};
  const allowedCommands =
    caps.allowedCommands === "allShellCommands" ||
    caps.allowedCommands === "all" ||
    Array.isArray(caps.allowedCommands)
      ? caps.allowedCommands
      : [];
  const inner = (
    <div
      className="h-full min-h-0 w-full overflow-hidden bg-background"
      data-nodex-view-id={view.id}
      data-nodex-allowed-commands={
        typeof allowedCommands === "string"
          ? allowedCommands
          : JSON.stringify(allowedCommands)
      }
      data-nodex-read-context={caps.readContext === true ? "1" : "0"}
      data-nodex-shell-view="1"
    >
      <C viewId={view.id} title={view.title} />
    </div>
  );
  if (activeMainTab !== undefined) {
    return (
      <ShellActiveMainTabProvider tab={activeMainTab}>{inner}</ShellActiveMainTabProvider>
    );
  }
  return inner;
}
