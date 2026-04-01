import { useEffect, useState } from "react";

export type ShellProjectWorkspaceState = {
  rootPath: string | null;
  workspaceRoots: string[];
  workspaceLabels: Record<string, string>;
};

const empty: ShellProjectWorkspaceState = {
  rootPath: null,
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
        setState({
          rootPath: s.rootPath ?? null,
          workspaceRoots: Array.isArray(s.workspaceRoots) ? s.workspaceRoots : [],
          workspaceLabels:
            s.workspaceLabels && typeof s.workspaceLabels === "object"
              ? s.workspaceLabels
              : {},
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
