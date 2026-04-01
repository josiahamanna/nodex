import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";
import {
  NodexContributionRegistry,
  type CommandContribution,
  type ModeLineContribution,
  type ModeLineSegmentId,
} from "./nodex-contribution-registry";
import { NodexContributionMenuBridge } from "./NodexContributionMenuBridge";
import { registerNodexCoreContributions } from "./registerNodexCoreContributions";

const RegistryContext = createContext<NodexContributionRegistry | null>(null);

export function NodexContributionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const registry = useMemo(() => new NodexContributionRegistry(), []);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => registry.subscribe(() => bump()), [registry]);

  useEffect(() => {
    const disposers = registerNodexCoreContributions(registry);
    return () => {
      for (const d of disposers) {
        d();
      }
    };
  }, [registry]);

  return (
    <RegistryContext.Provider value={registry}>
      {children}
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
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => registry.subscribe(() => tick()), [registry]);
  return registry.listCommands();
}

export function useNodexModeLineSegment(
  segment: ModeLineSegmentId,
): ModeLineContribution[] {
  const registry = useNodexContributionRegistry();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => registry.subscribe(() => tick()), [registry]);
  return registry.listModeLineForSegment(segment);
}
