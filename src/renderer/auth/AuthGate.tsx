import React from "react";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { EntryScreen } from "./EntryScreen";
import { ElectronRunModeGreet } from "./ElectronRunModeGreet";
import { ElectronSyncAuthPanel } from "./ElectronSyncAuthPanel";
import { isElectronUserAgent } from "../nodex-web-shim";
import { isWebScratchSession } from "./web-scratch";

export function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const {
    state,
    electronRunMode,
    chooseElectronRunMode,
    webAuthOverlay,
    closeWebAuth,
    electronSyncOverlay,
    closeElectronSyncAuth,
  } = useAuth();

  if (typeof window !== "undefined" && isElectronUserAgent()) {
    if (electronRunMode === "unset") {
      return <ElectronRunModeGreet onChoose={chooseElectronRunMode} />;
    }
    if (electronRunMode === "scratch" || electronRunMode === "notes") {
      if (electronSyncOverlay) {
        return (
          <>
            {children}
            <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-background/90 px-4 py-10 backdrop-blur-sm">
              <ElectronSyncAuthPanel
                initialMode={electronSyncOverlay}
                onBack={closeElectronSyncAuth}
                onSignedIn={closeElectronSyncAuth}
              />
            </div>
          </>
        );
      }
      return <>{children}</>;
    }
    return <>{children}</>;
  }

  if (state.status === "authed") {
    return <>{children}</>;
  }

  if (
    typeof window !== "undefined" &&
    !isElectronUserAgent() &&
    webAuthOverlay
  ) {
    return (
      <AuthScreen initialMode={webAuthOverlay} onBack={closeWebAuth} />
    );
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
