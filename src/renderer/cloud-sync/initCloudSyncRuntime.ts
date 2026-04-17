import type { NodexPlatformDeps } from "@nodex/platform";
import type { AppDispatch } from "../store";
import { runCloudSyncThunk } from "../store/cloudNotesSlice";

/**
 * Wire up sync triggers for desktop and online events.
 * Note: Session restoration is handled by AuthContext, not here, to avoid duplicate calls.
 */
export function initCloudSyncRuntime(
  deps: NodexPlatformDeps,
  dispatch: AppDispatch,
): void {
  if (typeof window === "undefined") {
    return;
  }

  if (deps.desktopHost.isElectron) {
    deps.desktopHost.onSyncTrigger(() => {
      void dispatch(runCloudSyncThunk());
    });
  }

  window.addEventListener("online", () => {
    void dispatch(runCloudSyncThunk());
  });
}
