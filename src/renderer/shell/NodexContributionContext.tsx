import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  NodexContributionRegistry,
  type CommandContribution,
  type ModeLineContribution,
  type ModeLineSegmentId,
} from "./nodex-contribution-registry";
import { NodexContributionMenuBridge } from "./NodexContributionMenuBridge";
import { registerNodexCoreContributions } from "./registerNodexCoreContributions";
import { useShellLayoutStore } from "./layout/ShellLayoutContext";
import { exposeDevtoolsShellApi } from "./devtoolsShellExpose";
import { useShellViewRegistry } from "./views/ShellViewContext";
import { ShellViewCommandContributions } from "./views/ShellViewCommandContributions";
import { useShellRegistries } from "./registries/ShellRegistriesContext";
import { postContextUpdateToFrames, type ShellContext } from "./views/shell-iframe-rpc";

const RegistryContext = createContext<NodexContributionRegistry | null>(null);

export function NodexContributionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const registry = useMemo(() => new NodexContributionRegistry(), []);
  const layoutStore = useShellLayoutStore();
  const viewRegistry = useShellViewRegistry();
  const registries = useShellRegistries();
  const lastCtxRef = React.useRef<ShellContext>({ primary: null });

  // Broadcast a minimal context snapshot (legacy hook for embeds; shell views are React).
  useEffect(() => {
    const unsub = registries.tabs.subscribe(() => {
      const a = registries.tabs.getActiveTab();
      const next: ShellContext = {
        primary: a
          ? {
              tabTypeId: a.tabTypeId,
              instanceId: a.instanceId,
              title: a.title,
            }
          : null,
      };
      lastCtxRef.current = next;
      postContextUpdateToFrames(next);
    });
    // Emit once on mount.
    const a = registries.tabs.getActiveTab();
    lastCtxRef.current = {
      primary: a
        ? { tabTypeId: a.tabTypeId, instanceId: a.instanceId, title: a.title }
        : null,
    };
    postContextUpdateToFrames(lastCtxRef.current);
    return unsub;
  }, [registries]);

  useEffect(() => {
    const disposers = registerNodexCoreContributions(registry, registries);
    return () => {
      for (const d of disposers) {
        d();
      }
    };
  }, [registry]);

  useLayoutEffect(() => {
    exposeDevtoolsShellApi({
      registry,
      layout: layoutStore,
      views: viewRegistry,
      registries,
    });
  }, [registry, layoutStore, viewRegistry, registries]);

  return (
    <RegistryContext.Provider value={registry}>
      {children}
      <ShellViewCommandContributions />
      <NodexContributionMenuBridge />
    </RegistryContext.Provider>
  );
}

export function useNodexContributionRegistry(): NodexContributionRegistry {
  const r = useContext(RegistryContext);
  if (!r) {
    throw new Error("useNodexContributionRegistry requires NodexContributionProvider");
  }
  return r;
}

/** Re-renders when the registry changes. */
export function useNodexCommands(): CommandContribution[] {
  const registry = useNodexContributionRegistry();
  useSyncExternalStore(
    (onChange) => registry.subscribe(onChange),
    () => registry.getSnapshotVersion(),
    () => 0,
  );
  return registry.listCommands();
}

export function useNodexModeLineSegment(
  segment: ModeLineSegmentId,
): ModeLineContribution[] {
  const registry = useNodexContributionRegistry();
  useSyncExternalStore(
    (onChange) => registry.subscribe(onChange),
    () => registry.getSnapshotVersion(),
    () => 0,
  );
  return registry.listModeLineForSegment(segment);
}
