/** sessionStorage: anonymous web “try the app” session (cloud notes in IndexedDB until login). */
export const WEB_SCRATCH_SESSION_KEY = "nodex.web.scratchSession";

/** RxDB / Dexie database segment for offline cloud notes while signed out (web scratch). */
export const WEB_SCRATCH_CLOUD_USER_ID = "__nodex_web_scratch__";

export function isWebScratchSession(): boolean {
  if (typeof sessionStorage === "undefined") {
    return false;
  }
  return sessionStorage.getItem(WEB_SCRATCH_SESSION_KEY) === "1";
}

export function setWebScratchSession(enabled: boolean): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  if (enabled) {
    sessionStorage.setItem(WEB_SCRATCH_SESSION_KEY, "1");
  } else {
    sessionStorage.removeItem(WEB_SCRATCH_SESSION_KEY);
  }
}
