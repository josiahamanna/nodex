import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authLogin, authLogout, authRefresh, authSignup } from "./auth-client";
import { setAccessToken, type AuthUser } from "./auth-session";
import { isElectronUserAgent } from "../nodex-web-shim";
import { isWebScratchSession } from "./web-scratch";
import {
  readElectronRunMode,
  writeElectronRunMode,
  type ElectronRunMode,
  type ElectronRunModeChoice,
} from "./electron-run-mode";

const LOCAL_AUTH_USER: AuthUser = {
  id: "local",
  email: "local@nodex",
  username: "local",
  isAdmin: true,
};

type AuthState =
  | { status: "loading"; user: null }
  | { status: "authed"; user: AuthUser }
  | { status: "anon"; user: null };

type AuthContextValue = {
  state: AuthState;
  /** Electron only; always `"unset"` in the browser. */
  electronRunMode: ElectronRunMode;
  chooseElectronRunMode: (mode: ElectronRunModeChoice) => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  setAnon: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return v;
}

function initialAuthState(): AuthState {
  if (typeof window === "undefined") {
    return { status: "loading", user: null };
  }
  if (isElectronUserAgent()) {
    const mode = readElectronRunMode();
    if (mode === "local") {
      return { status: "authed", user: LOCAL_AUTH_USER };
    }
    if (mode === "cloud") {
      return { status: "loading", user: null };
    }
    return { status: "anon", user: null };
  }
  return { status: "loading", user: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [electronRunMode, setElectronRunModeState] = useState<ElectronRunMode>(() =>
    typeof window === "undefined" ? "unset" : isElectronUserAgent()
      ? readElectronRunMode()
      : "unset",
  );
  const [state, setState] = useState<AuthState>(initialAuthState);

  const refreshSession = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isElectronUserAgent()) {
      if (electronRunMode !== "cloud") {
        return;
      }
      setState({ status: "loading", user: null });
      try {
        const u = await authRefresh();
        setState({ status: "authed", user: u });
      } catch {
        setAccessToken(null);
        setState({ status: "anon", user: null });
      }
      return;
    }
    setState({ status: "loading", user: null });
    try {
      const u = await authRefresh();
      setState({ status: "authed", user: u });
    } catch {
      setAccessToken(null);
      setState({ status: "anon", user: null });
    }
  }, [electronRunMode]);

  useEffect(() => {
    void (async () => {
      if (typeof window === "undefined") return;
      if (isElectronUserAgent()) {
        if (electronRunMode !== "cloud") {
          return;
        }
        try {
          const u = await authRefresh();
          setState({ status: "authed", user: u });
          return;
        } catch {
          /* fall through */
        }
        setState({ status: "anon", user: null });
        return;
      }
      try {
        const u = await authRefresh();
        setState({ status: "authed", user: u });
        return;
      } catch {
        /* fall through */
      }
      setState({ status: "anon", user: null });
    })();
  }, [electronRunMode]);

  const chooseElectronRunMode = useCallback((mode: ElectronRunModeChoice) => {
    writeElectronRunMode(mode);
    setElectronRunModeState(mode);
    setAccessToken(null);
    if (mode === "local") {
      setState({ status: "authed", user: LOCAL_AUTH_USER });
      return;
    }
    setState({ status: "loading", user: null });
  }, []);

  const mergeWebScratchCloudNotesAfterAuth = useCallback(async (userId: string) => {
    if (isElectronUserAgent() || !isWebScratchSession()) {
      return;
    }
    const { migrateWebScratchCloudNotesToUser } = await import(
      "../cloud-sync/migrate-web-scratch-cloud-notes",
    );
    await migrateWebScratchCloudNotesToUser(userId);
    const { store } = await import("../store");
    const { cloudNotesSlice } = await import("../store/cloudNotesSlice");
    const { openCloudNotesDbForUser, rxdbFindAllCloudNotes } = await import(
      "../cloud-sync/cloud-notes-rxdb",
    );
    await openCloudNotesDbForUser(userId);
    const rows = await rxdbFindAllCloudNotes();
    store.dispatch(cloudNotesSlice.actions.hydrateFromRxDb({ rows }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const u = await authLogin({ email, password });
      await mergeWebScratchCloudNotesAfterAuth(u.id);
      setState({ status: "authed", user: u });
    },
    [mergeWebScratchCloudNotesAfterAuth],
  );

  const signup = useCallback(
    async (email: string, username: string, password: string) => {
      const u = await authSignup({ email, username, password });
      await mergeWebScratchCloudNotesAfterAuth(u.id);
      setState({ status: "authed", user: u });
    },
    [mergeWebScratchCloudNotesAfterAuth],
  );

  const logout = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isElectronUserAgent() && electronRunMode !== "cloud") {
      return;
    }
    await authLogout();
    setState({ status: "anon", user: null });
  }, [electronRunMode]);

  const setAnon = useCallback(() => {
    setAccessToken(null);
    setState({ status: "anon", user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      electronRunMode: isElectronUserAgent() ? electronRunMode : "unset",
      chooseElectronRunMode,
      login,
      signup,
      logout,
      refreshSession,
      setAnon,
    }),
    [
      state,
      electronRunMode,
      chooseElectronRunMode,
      login,
      signup,
      logout,
      refreshSession,
      setAnon,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

