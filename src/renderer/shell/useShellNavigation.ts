import { useCallback, useMemo } from "react";
import { useNodexContributionRegistry } from "./NodexContributionContext";
import { useShellLayoutStore } from "./layout/ShellLayoutContext";
import { useShellRegistries } from "./registries/ShellRegistriesContext";
import { useShellViewRegistry } from "./views/ShellViewContext";
import { openNoteInShell } from "./openNoteInShell";
import { runShellMenuRailAction, type ShellNavigationDeps } from "./shellRailNavigation";
import type { ShellMenuRailItem } from "./registries/ShellMenuRailRegistry";

export function useShellNavigation(): {
  deps: ShellNavigationDeps;
  openFromRailItem: (item: ShellMenuRailItem) => void;
  openNoteById: (noteId: string) => void;
  invokeCommand: (commandId: string, args?: Record<string, unknown>) => unknown;
} {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const layout = useShellLayoutStore();
  const contrib = useNodexContributionRegistry();

  const deps = useMemo<ShellNavigationDeps>(
    () => ({ tabs: regs.tabs, views, layout }),
    [regs.tabs, views, layout],
  );

  const invokeCommand = useCallback(
    (commandId: string, args?: Record<string, unknown>) =>
      contrib.invokeCommand(commandId, args),
    [contrib],
  );

  const openFromRailItem = useCallback(
    (item: ShellMenuRailItem) => {
      runShellMenuRailAction(item, deps, invokeCommand);
    },
    [deps, invokeCommand],
  );

  const openNoteById = useCallback(
    (noteId: string) => {
      openNoteInShell(noteId, deps);
    },
    [deps],
  );

  return { deps, openFromRailItem, openNoteById, invokeCommand };
}
