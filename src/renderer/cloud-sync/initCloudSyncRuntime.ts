import type { NodexPlatformDeps } from "@nodex/platform";
import type { AppDispatch } from "../store";
import { cloudRestoreSessionThunk } from "../store/cloudAuthSlice";
import { runCloudSyncThunk } from "../store/cloudNotesSlice";

/**
 * Hydrate JWT from storage, optional `/auth/me`, initial pull, then wire sync triggers.
 */
export function initCloudSyncRuntime(
  deps: NodexPlatformDeps,
  dispatch: AppDispatch,
): void {
  if (typeof window === "undefined") {
    return;
  }

  void dispatch(cloudRestoreSessionThunk());

  if (deps.desktopHost.isElectron) {
    deps.desktopHost.onSyncTrigger(() => {
      void dispatch(runCloudSyncThunk());
    });
  }

  window.addEventListener("online", () => {
    void dispatch(runCloudSyncThunk());
  });
}
