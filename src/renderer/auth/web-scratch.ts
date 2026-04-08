/**
 * localStorage flag: anonymous web “try the app” session (try-out notes in IndexedDB until login).
 * Legacy sessionStorage values are migrated once on read.
 */
export const WEB_SCRATCH_SESSION_KEY = "nodex.web.scratchSession";

/** RxDB / Dexie database segment for offline cloud notes while signed out (web scratch). */
export const WEB_SCRATCH_CLOUD_USER_ID = "__nodex_web_scratch__";

function migrateLegacyScratchSessionFromSessionStorage(): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  const legacy = sessionStorage.getItem(WEB_SCRATCH_SESSION_KEY);
  if (legacy === "1") {
    localStorage.setItem(WEB_SCRATCH_SESSION_KEY, "1");
    sessionStorage.removeItem(WEB_SCRATCH_SESSION_KEY);
  }
}

export function isWebScratchSession(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return false;
  }
  migrateLegacyScratchSessionFromSessionStorage();
  return localStorage.getItem(WEB_SCRATCH_SESSION_KEY) === "1";
}

export function setWebScratchSession(enabled: boolean): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(WEB_SCRATCH_SESSION_KEY);
  }
  if (enabled) {
    localStorage.setItem(WEB_SCRATCH_SESSION_KEY, "1");
  } else {
    localStorage.removeItem(WEB_SCRATCH_SESSION_KEY);
  }
}

/** Leave try-out UI and return to the marketing page; try-out data stays in this browser (localStorage + IndexedDB). */
export function exitWebScratchKeepData(): void {
  setWebScratchSession(false);
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

/** Clear try-out localStorage + IndexedDB, then start a fresh try-out session (reload). */
export async function resetWebScratchClearLocalData(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  const { destroyCloudNotesDbForUser } = await import("../cloud-sync/cloud-notes-rxdb");
  await destroyCloudNotesDbForUser(WEB_SCRATCH_CLOUD_USER_ID);
  setWebScratchSession(true);
  window.location.reload();
}
