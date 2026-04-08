import React from "react";
import { useAuth } from "./AuthContext";
import { EntryScreen } from "./EntryScreen";
import { ElectronRunModeGreet } from "./ElectronRunModeGreet";
import { isElectronUserAgent } from "../nodex-web-shim";
import { isWebScratchSession } from "./web-scratch";

export function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const { state, electronRunMode, chooseElectronRunMode } = useAuth();

  if (typeof window !== "undefined" && isElectronUserAgent()) {
    if (electronRunMode === "unset") {
      return <ElectronRunModeGreet onChoose={chooseElectronRunMode} />;
    }
    if (electronRunMode === "local") {
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
    return <EntryScreen />;
  }

  if (state.status === "authed") {
    return <>{children}</>;
  }

  if (
    typeof window !== "undefined" &&
    !isElectronUserAgent() &&
    state.status === "anon" &&
    isWebScratchSession()
  ) {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return (
      <div className="flex h-screen min-h-0 w-full items-center justify-center bg-background text-[12px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <EntryScreen />;
}

