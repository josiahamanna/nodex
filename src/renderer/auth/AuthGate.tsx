import React from "react";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { isElectronUserAgent } from "../nodex-web-shim";

export function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const { state } = useAuth();

  if (typeof window !== "undefined" && isElectronUserAgent()) {
    return <>{children}</>;
  }

  if (state.status === "authed") {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return (
      <div className="flex h-screen min-h-0 w-full items-center justify-center bg-background text-[12px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <AuthScreen />;
}

