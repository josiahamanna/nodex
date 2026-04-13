import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useAuth } from "./AuthContext";
import { AuthScreen } from "./AuthScreen";
import { EntryScreen } from "./EntryScreen";
import { ElectronRunModeGreet } from "./ElectronRunModeGreet";
import { ElectronSyncAuthPanel } from "./ElectronSyncAuthPanel";
import { isElectronUserAgent } from "../nodex-web-shim";
import { isElectronCloudWpnSession } from "./electron-cloud-session";
import { isWebScratchSession } from "./web-scratch";
import type { RootState } from "../store";

export function AuthGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const {
    state,
    electronRunMode,
    chooseElectronRunMode,
    webAuthOverlay,
    closeWebAuth,
    electronSyncOverlay,
    closeElectronSyncAuth,
    openElectronSyncAuth,
    exitElectronSessionToWelcome,
  } = useAuth();
  const cloudAuth = useSelector((s: RootState) => s.cloudAuth);

  useEffect(() => {
    if (typeof window === "undefined" || !isElectronUserAgent()) {
      return;
    }
    if (electronRunMode !== "cloud") {
      return;
    }
    if (cloudAuth.status !== "signedOut" || cloudAuth.busy) {
      return;
    }
    if (electronSyncOverlay !== null) {
      return;
    }
    openElectronSyncAuth("signup");
  }, [
    cloudAuth.busy,
    cloudAuth.status,
    electronRunMode,
    electronSyncOverlay,
    openElectronSyncAuth,
  ]);

  if (typeof window !== "undefined" && isElectronUserAgent()) {
    if (electronRunMode === "unset") {
      return <ElectronRunModeGreet onChoose={chooseElectronRunMode} />;
    }
    if (electronRunMode === "scratch" || electronRunMode === "local" || electronRunMode === "cloud") {
      if (electronSyncOverlay) {
        return (
          <>
            {children}
            <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/90 backdrop-blur-sm">
              <div className="flex min-h-full items-center justify-center px-4 py-8">
                <ElectronSyncAuthPanel
                  initialMode={electronSyncOverlay}
                  onBack={
                    isElectronCloudWpnSession() ? exitElectronSessionToWelcome : closeElectronSyncAuth
                  }
                  backLabel={isElectronCloudWpnSession() ? "Return to home" : "Back"}
                  onSignedIn={closeElectronSyncAuth}
                />
              </div>
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
