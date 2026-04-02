import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { authLogin, authLogout, authMe, authRefresh, authSignup } from "./auth-client";
import { setAccessToken, type AuthUser } from "./auth-session";
import { isElectronUserAgent } from "../nodex-web-shim";

type AuthState =
  | { status: "loading"; user: null }
  | { status: "authed"; user: AuthUser }
  | { status: "anon"; user: null };

type AuthContextValue = {
  state: AuthState;
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

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [state, setState] = useState<AuthState>(() => {
    if (typeof window !== "undefined" && !isElectronUserAgent()) {
      return { status: "loading", user: null };
    }
    return { status: "authed", user: { id: "local", email: "local@nodex", username: "local" } };
  });

  const refreshSession = useCallback(async () => {
    if (typeof window === "undefined" || isElectronUserAgent()) return;
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
      if (typeof window === "undefined" || isElectronUserAgent()) return;
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

  const login = useCallback(async (email: string, password: string) => {
    const u = await authLogin({ email, password });
    setState({ status: "authed", user: u });
  }, []);

  const signup = useCallback(async (email: string, username: string, password: string) => {
    const u = await authSignup({ email, username, password });
    setState({ status: "authed", user: u });
  }, []);

  const logout = useCallback(async () => {
    if (typeof window === "undefined" || isElectronUserAgent()) return;
    await authLogout();
    setState({ status: "anon", user: null });
  }, []);

  const setAnon = useCallback(() => {
    setAccessToken(null);
    setState({ status: "anon", user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, signup, logout, refreshSession, setAnon }),
    [state, login, signup, logout, refreshSession, setAnon],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

