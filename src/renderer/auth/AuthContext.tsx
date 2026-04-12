import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authLogin, authLogout, authRefresh, authSignup } from "./auth-client";
import { setAccessToken, type AuthUser } from "./auth-session";
import {
  isElectronUserAgent,
  nodexWebBackendSyncOnly,
  syncWpnUsesSyncApi,
} from "../nodex-web-shim";
import { isWebScratchSession } from "./web-scratch";
import {
  clearElectronRunMode,
  readElectronRunMode,
  writeElectronRunMode,
  type ElectronRunMode,
  type ElectronRunModeChoice,
} from "./electron-run-mode";
import { store } from "../store";
import {
  cloudLoginThunk,
  cloudLogoutThunk,
  cloudRegisterThunk,
} from "../store/cloudAuthSlice";

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

type WebAuthOverlayMode = "login" | "signup";

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
  /** Web only: full-screen login/signup over the shell (e.g. from Notes explorer). */
  webAuthOverlay: WebAuthOverlayMode | null;
  openWebAuth: (mode: WebAuthOverlayMode) => void;
  closeWebAuth: () => void;
  /** Electron Notes: overlay for sync API sign-in / register. */
  electronSyncOverlay: WebAuthOverlayMode | null;
  openElectronSyncAuth: (mode: WebAuthOverlayMode) => void;
  closeElectronSyncAuth: () => void;
  /** Electron only: leave workbench and return to the welcome screen (does not quit the app). */
  exitElectronSessionToWelcome: () => void;
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
    if (mode === "notes") {
      return { status: "authed", user: LOCAL_AUTH_USER };
    }
    if (mode === "scratch") {
      return { status: "anon", user: null };
    }
    return { status: "anon", user: null };
  }
  return { status: "loading", user: null };
}

function webUsesSyncServiceAuth(): boolean {
  if (typeof window === "undefined" || isElectronUserAgent()) {
    return false;
  }
  return nodexWebBackendSyncOnly() || syncWpnUsesSyncApi();
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [electronRunMode, setElectronRunModeState] = useState<ElectronRunMode>(() =>
    typeof window === "undefined" ? "unset" : isElectronUserAgent()
      ? readElectronRunMode()
      : "unset",
  );
  const [state, setState] = useState<AuthState>(initialAuthState);
  const [webAuthOverlay, setWebAuthOverlay] = useState<WebAuthOverlayMode | null>(null);
  const [electronSyncOverlay, setElectronSyncOverlay] = useState<WebAuthOverlayMode | null>(null);

  useEffect(() => {
    if (state.status === "authed") {
      setWebAuthOverlay(null);
    }
  }, [state.status]);

  const refreshSession = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isElectronUserAgent()) {
      return;
    }
    if (nodexWebBackendSyncOnly() || syncWpnUsesSyncApi()) {
      setAccessToken(null);
      setState({ status: "anon", user: null });
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
  }, []);

  useEffect(() => {
    void (async () => {
      if (typeof window === "undefined") return;
      if (isElectronUserAgent()) {
        return;
      }
      if (nodexWebBackendSyncOnly() || syncWpnUsesSyncApi()) {
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
  }, []);

  const chooseElectronRunMode = useCallback((mode: ElectronRunModeChoice) => {
    if (mode === "scratch") {
      void store.dispatch(cloudLogoutThunk());
    }
    writeElectronRunMode(mode);
    setElectronRunModeState(mode);
    setAccessToken(null);
    if (mode === "notes") {
      setState({ status: "authed", user: LOCAL_AUTH_USER });
      return;
    }
    setState({ status: "anon", user: null });
  }, []);

  const mergeWebScratchCloudNotesAfterAuth = useCallback(async (userId: string) => {
    if (isElectronUserAgent() || !isWebScratchSession()) {
      return;
    }
    const { migrateWebScratchCloudNotesToUser } = await import(
      "../cloud-sync/migrate-web-scratch-cloud-notes"
    );
    await migrateWebScratchCloudNotesToUser(userId);
    const { store: appStore } = await import("../store");
    const { cloudNotesSlice } = await import("../store/cloudNotesSlice");
    const { openCloudNotesDbForUser, rxdbFindAllCloudNotes } = await import(
      "../cloud-sync/cloud-notes-rxdb"
    );
    await openCloudNotesDbForUser(userId);
    const rows = await rxdbFindAllCloudNotes();
    appStore.dispatch(cloudNotesSlice.actions.hydrateFromRxDb({ rows }));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      if (webUsesSyncServiceAuth()) {
        const result = await store.dispatch(cloudLoginThunk({ email, password }));
        if (cloudLoginThunk.rejected.match(result)) {
          throw new Error(result.error.message ?? "Login failed");
        }
        const { userId, email: e } = result.payload;
        await mergeWebScratchCloudNotesAfterAuth(userId);
        const localPart = e.includes("@") ? e.slice(0, e.indexOf("@")) : e;
        setState({
          status: "authed",
          user: { id: userId, email: e, username: localPart || "user" },
        });
        return;
      }
      const u = await authLogin({ email, password });
      await mergeWebScratchCloudNotesAfterAuth(u.id);
      setState({ status: "authed", user: u });
    },
    [mergeWebScratchCloudNotesAfterAuth],
  );

  const signup = useCallback(
    async (email: string, username: string, password: string) => {
      if (webUsesSyncServiceAuth()) {
        const result = await store.dispatch(cloudRegisterThunk({ email, password }));
        if (cloudRegisterThunk.rejected.match(result)) {
          throw new Error(result.error.message ?? "Signup failed");
        }
        const { userId, email: e } = result.payload;
        await mergeWebScratchCloudNotesAfterAuth(userId);
        const name = username.trim() || (e.includes("@") ? e.slice(0, e.indexOf("@")) : e) || "user";
        setState({
          status: "authed",
          user: { id: userId, email: e, username: name },
        });
        return;
      }
      const u = await authSignup({ email, username, password });
      await mergeWebScratchCloudNotesAfterAuth(u.id);
      setState({ status: "authed", user: u });
    },
    [mergeWebScratchCloudNotesAfterAuth],
  );

  const logout = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (isElectronUserAgent()) {
      return;
    }
    if (webUsesSyncServiceAuth()) {
      await store.dispatch(cloudLogoutThunk());
    } else {
      await authLogout();
    }
    setState({ status: "anon", user: null });
  }, []);

  const setAnon = useCallback(() => {
    setAccessToken(null);
    setState({ status: "anon", user: null });
  }, []);

  const openWebAuth = useCallback((mode: WebAuthOverlayMode) => {
    if (typeof window === "undefined" || isElectronUserAgent()) {
      return;
    }
    setWebAuthOverlay(mode);
  }, []);

  const closeWebAuth = useCallback(() => {
    setWebAuthOverlay(null);
  }, []);

  const openElectronSyncAuth = useCallback((mode: WebAuthOverlayMode) => {
    if (typeof window === "undefined" || !isElectronUserAgent()) {
      return;
    }
    setElectronSyncOverlay(mode);
  }, []);

  const closeElectronSyncAuth = useCallback(() => {
    setElectronSyncOverlay(null);
  }, []);

  const exitElectronSessionToWelcome = useCallback(() => {
    if (typeof window === "undefined" || !isElectronUserAgent()) {
      return;
    }
    void (async () => {
      try {
        await store.dispatch(cloudLogoutThunk());
      } catch {
        /* still leave workbench */
      }
      clearElectronRunMode();
      setElectronRunModeState("unset");
      setAccessToken(null);
      setElectronSyncOverlay(null);
      setState({ status: "anon", user: null });
    })();
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
      webAuthOverlay,
      openWebAuth,
      closeWebAuth,
      electronSyncOverlay,
      openElectronSyncAuth,
      closeElectronSyncAuth,
      exitElectronSessionToWelcome,
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
      webAuthOverlay,
      openWebAuth,
      closeWebAuth,
      electronSyncOverlay,
      openElectronSyncAuth,
      closeElectronSyncAuth,
      exitElectronSessionToWelcome,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
