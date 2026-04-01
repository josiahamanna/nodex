import { useEffect, useState } from "react";

export type ShellProjectMountKind = "folder" | "wpn-postgres";

export type ShellProjectWorkspaceState = {
  rootPath: string | null;
  notesDbPath: string | null;
  workspaceRoots: string[];
  workspaceLabels: Record<string, string>;
  mountKind?: ShellProjectMountKind;
};

const empty: ShellProjectWorkspaceState = {
  rootPath: null,
  notesDbPath: null,
  workspaceRoots: [],
  workspaceLabels: {},
};

/**
 * Project / workspace roots for shell views (mirrors headless `getProjectState` when available).
 */
export function useShellProjectWorkspace(): ShellProjectWorkspaceState {
  const [state, setState] = useState<ShellProjectWorkspaceState>(empty);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const s = await window.Nodex.getProjectState();
        if (cancelled || !s) return;
        const mk = s.mountKind;
        let mountKind: ShellProjectMountKind | undefined =
          mk === "wpn-postgres" || mk === "folder" ? mk : undefined;
        if (!mountKind && s.rootPath) {
          mountKind = "folder";
        }
        setState({
          rootPath: s.rootPath ?? null,
          notesDbPath: s.notesDbPath ?? null,
          workspaceRoots: Array.isArray(s.workspaceRoots) ? s.workspaceRoots : [],
          workspaceLabels:
            s.workspaceLabels && typeof s.workspaceLabels === "object"
              ? s.workspaceLabels
              : {},
          ...(mountKind ? { mountKind } : {}),
        });
      } catch {
        if (!cancelled) setState(empty);
      }
    };
    void tick();
    const unsub = window.Nodex.onProjectRootChanged(() => {
      void tick();
    });
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsub();
    };
  }, []);

  return state;
}
