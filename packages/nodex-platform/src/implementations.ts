import type {
  DesktopHost,
  LocalStore,
  NodexPlatformDeps,
  NotesPersistencePort,
  RemoteApi,
} from "./ports";
import type { SyncPullResponse, SyncPushResponse } from "./sync-types";
import { createFetchRemoteApi } from "./remote-fetch";
import { createSyncBaseUrlResolver } from "./resolve-sync-base";

function isElectronUserAgent(): boolean {
  return (
    typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")
  );
}

/** No remote URL: sync no-ops; auth throws. */
export function createStubRemoteApi(): RemoteApi {
  let token: string | null = null;
  const needUrl = (): never => {
    throw new Error("Nodex sync API URL is not configured");
  };
  return {
    getBaseUrl: () => "",
    setAuthToken: (t) => {
      token = t;
    },
    setRefreshToken: () => {},
    authRegister: () => needUrl(),
    authLogin: () => needUrl(),
    authRefresh: () => needUrl(),
    authMe: () => needUrl(),
    syncPush: async (): Promise<SyncPushResponse> => {
      void token;
      return { accepted: [], conflicts: [] };
    },
    syncPull: async (): Promise<SyncPullResponse> => ({
      documents: [],
      lastSync: Date.now(),
    }),
  };
}

export function createNoopDesktopHost(): DesktopHost {
  return {
    isElectron: false,
    onSyncTrigger: () => () => {},
  };
}

export function createElectronDesktopHost(): DesktopHost {
  return {
    isElectron: true,
    onSyncTrigger: (callback) => {
      const w = globalThis as unknown as {
        nodexDesktop?: { onSyncTrigger?: (cb: () => void) => () => void };
      };
      const bridge = w.nodexDesktop?.onSyncTrigger;
      if (typeof bridge === "function") {
        return bridge(callback);
      }
      return () => {};
    },
  };
}

function notesPortFromNodexGlobal(): NotesPersistencePort {
  if (typeof window === "undefined") {
    throw new Error("@nodex/platform: window.Nodex is not available in this context");
  }
  const nodex = (window as unknown as { Nodex?: NotesPersistencePort }).Nodex;
  if (!nodex) {
    throw new Error(
      "@nodex/platform: window.Nodex is missing — install preload or web shim before Redux store init",
    );
  }
  return nodex;
}

export function createWebThinLocalStore(
  notes?: NotesPersistencePort,
): LocalStore {
  return {
    profile: "web-thin",
    notes: notes ?? notesPortFromNodexGlobal(),
  };
}

export function createElectronOfflineFirstLocalStore(
  notes?: NotesPersistencePort,
): LocalStore {
  return {
    profile: "electron-offline-first",
    notes: notes ?? notesPortFromNodexGlobal(),
  };
}

export interface CreateNodexPlatformDepsOptions {
  /** Override notes backend (tests). */
  notes?: NotesPersistencePort;
  /** Force profile (tests). */
  profile?: "web" | "electron";
  /** Highest-priority sync API base URL (no trailing slash); empty falls through to env. */
  getSyncApiBaseUrl?: () => string;
}

/**
 * Compose platform deps for the current runtime.
 * - Web PWA: server-first mental model; `LocalStore` stays thin (delegates to `window.Nodex` web shim).
 * - Electron: local-first target (RxDB migration hooks into same port later); `DesktopHost` exposes IPC when preload adds `window.nodexDesktop.onSyncTrigger`.
 */
export function createNodexPlatformDeps(
  options: CreateNodexPlatformDepsOptions = {},
): NodexPlatformDeps {
  const profile =
    options.profile ?? (isElectronUserAgent() ? "electron" : "web");
  const getBase = createSyncBaseUrlResolver(options.getSyncApiBaseUrl);
  const remoteApi = createFetchRemoteApi(getBase);
  const localStore =
    profile === "electron"
      ? createElectronOfflineFirstLocalStore(options.notes)
      : createWebThinLocalStore(options.notes);
  const desktopHost =
    profile === "electron" ? createElectronDesktopHost() : createNoopDesktopHost();

  return {
    profile,
    remoteApi,
    localStore,
    desktopHost,
  };
}
