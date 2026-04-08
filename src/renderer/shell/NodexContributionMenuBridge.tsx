import { getNodex } from "../../shared/nodex-host-access";
import React, { useEffect } from "react";
import { useNodexContributionRegistry } from "./NodexContributionContext";

/**
 * Connects Electron main-menu IPC to {@link NodexContributionRegistry.invokeCommand}.
 */
export function NodexContributionMenuBridge(): null {
  const registry = useNodexContributionRegistry();

  useEffect(() => {
    const api = getNodex();
    if (!api?.onRunContributionCommand) {
      return undefined;
    }
    return api.onRunContributionCommand(({ commandId }) => {
      try {
        const r = registry.invokeCommand(commandId);
        void Promise.resolve(r).catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.error("[NodexContributionMenuBridge]", commandId, err);
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[NodexContributionMenuBridge]", commandId, err);
      }
    });
  }, [registry]);

  return null;
}
