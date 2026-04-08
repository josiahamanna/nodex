import { getNodex } from "../../shared/nodex-host-access";
import React, { createContext, useContext, useEffect, useState } from "react";
import { store } from "../store";
import { fetchAllNotes } from "../store/notesSlice";

export type ShellProjectMountKind = "folder";

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

const ShellProjectWorkspaceContext =
  createContext<ShellProjectWorkspaceState | null>(null);

/**
 * One shared subscription to `getProjectState` for the whole shell (avoids N parallel polls per hook consumer).
 */
export function ShellProjectWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<ShellProjectWorkspaceState>(empty);

  useEffect(() => {
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const s = await getNodex().getProjectState();
        if (cancelled || !s) return;
        const mk = s.mountKind;
        let mountKind: ShellProjectMountKind | undefined = mk === "folder" ? mk : undefined;
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
    const unsub = getNodex().onProjectRootChanged(() => {
      void tick();
      void store.dispatch(fetchAllNotes());
    });
    const id = window.setInterval(() => void tick(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      unsub();
    };
  }, []);

  return React.createElement(
    ShellProjectWorkspaceContext.Provider,
    { value: state },
    children,
  );
}

/**
 * Project / workspace roots for shell views (mirrors headless `getProjectState` when available).
 */
export function useShellProjectWorkspace(): ShellProjectWorkspaceState {
  const ctx = useContext(ShellProjectWorkspaceContext);
  if (ctx === null) {
    throw new Error(
      "useShellProjectWorkspace must be used within ShellProjectWorkspaceProvider",
    );
  }
  return ctx;
}
