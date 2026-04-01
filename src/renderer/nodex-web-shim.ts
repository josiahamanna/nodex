import type { NodexRendererApi } from "../shared/nodex-renderer-api";

const noopUnsub = (): void => {};

async function webRequest<T>(
  baseUrl: string,
  method: string,
  apiPath: string,
  body?: unknown,
): Promise<T> {
  const root = baseUrl.replace(/\/$/, "");
  const url = `${root}/api/v1${apiPath}`;
  const init: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined && method !== "GET" && method !== "HEAD") {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    let msg = `${method} ${apiPath} failed (${res.status})`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string" && j.error.length > 0) {
        msg = j.error;
      }
    } catch {
      if (text.trim().length > 0) {
        msg = text;
      }
    }
    throw new Error(msg);
  }
  if (res.status === 204 || text.length === 0) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Minimal `window.Nodex` for browser dev: talks to the headless API (`src/nodex-api-server`) over HTTP.
 * Set `window.__NODEX_WEB_API_BASE__` (see `index.html` query bootstrap) before the bundle runs.
 */
export function createWebNodexApi(baseUrl: string): NodexRendererApi {
  const req = <T>(method: string, path: string, body?: unknown) =>
    webRequest<T>(baseUrl, method, path, body);

  const impl: Partial<NodexRendererApi> = {
    getNote: (noteId?: string) =>
      req(
        "GET",
        noteId
          ? `/notes/detail?id=${encodeURIComponent(noteId)}`
          : "/notes/detail",
      ),
    getAllNotes: () => req("GET", "/notes"),
    createNote: (payload) => req("POST", "/notes", payload),
    renameNote: (id, title) =>
      req("PATCH", `/notes/${encodeURIComponent(id)}`, { title }),
    deleteNotes: (ids) => req("POST", "/notes/delete", { ids }),
    moveNote: (draggedId, targetId, placement) =>
      req("POST", "/notes/move", { draggedId, targetId, placement }),
    moveNotesBulk: (ids, targetId, placement) =>
      req("POST", "/notes/move-bulk", { ids, targetId, placement }),
    pasteSubtree: (payload) => req("POST", "/notes/paste", payload),
    saveNotePluginUiState: (noteId, state) =>
      req("PATCH", `/notes/${encodeURIComponent(noteId)}`, {
        pluginUiState: state,
      }),
    saveNoteContent: (noteId, content) =>
      req("PATCH", `/notes/${encodeURIComponent(noteId)}`, { content }),
    getComponent: async () => null,
    getPluginHTML: async () => null,
    getRegisteredTypes: async () => {
      const r = await req<{ types: string[] }>("GET", "/notes/types/registered");
      return r.types;
    },
    getSelectableNoteTypes: async () => {
      const r = await req<{ types: string[] }>(
        "GET",
        "/notes/types/selectable",
      );
      return r.types;
    },
    getProjectState: () => req("GET", "/project/state"),
    getAppPrefs: async () => ({ seedSampleNotes: true }),
    nodexUndo: () => req("POST", "/undo"),
    nodexRedo: () => req("POST", "/redo"),
    onPluginsChanged: () => noopUnsub,
    onProjectRootChanged: () => noopUnsub,
    onPluginProgress: () => noopUnsub,
    onIdeWorkspaceFsChanged: () => noopUnsub,
    onMainDebugLog: () => noopUnsub,
    onNativeThemeChanged: (callback) => {
      if (typeof window === "undefined") {
        return noopUnsub;
      }
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const fn = () => callback(mq.matches);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    onRunContributionCommand: () => noopUnsub,
    sendClientLog: () => {},
    assetUrl: () => "nodex-asset:web-unsupported",
    getNativeThemeDark: async () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  };

  return new Proxy(impl as NodexRendererApi, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return undefined;
      }
      if (prop in target && target[prop as keyof NodexRendererApi] !== undefined) {
        return Reflect.get(target, prop, receiver);
      }
      const key = String(prop);
      if (key.startsWith("on") && key.length > 3) {
        return () => noopUnsub;
      }
      return (..._args: unknown[]) =>
        Promise.reject(
          new Error(
            `[Nodex Web] Not implemented over HTTP: ${key}. Run the Electron app for full API.`,
          ),
        );
    },
  });
}

/**
 * Offline-safe `window.Nodex` for plain browser (e.g. `next dev` without Electron and without `?web=1&api=`).
 * Enough for the shell to mount; host actions show as cancelled / empty until you use Electron or the HTTP API.
 */
export function createPlainBrowserDevStub(): NodexRendererApi {
  const impl: Partial<NodexRendererApi> = {
    getNote: async () => null,
    getAllNotes: async () => [],
    getProjectState: async () => ({
      rootPath: null,
      notesDbPath: null,
      workspaceRoots: [],
      workspaceLabels: {},
    }),
    getSelectableNoteTypes: async () => [],
    getRegisteredTypes: async () => [],
    getAppPrefs: async () => ({ seedSampleNotes: true }),
    setSeedSampleNotes: async () => ({
      ok: false as const,
      error: "Not available in plain browser — use Electron or ?web=1&api=…",
    }),
    getNativeThemeDark: async () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
    onNativeThemeChanged: (callback) => {
      if (typeof window === "undefined") {
        return noopUnsub;
      }
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const fn = () => callback(mq.matches);
      mq.addEventListener("change", fn);
      return () => mq.removeEventListener("change", fn);
    },
    getMainDebugLogBuffer: async () => [],
    onMainDebugLog: () => noopUnsub,
    clearMainDebugLogBuffer: async () => ({ success: true }),
    onPluginsChanged: () => noopUnsub,
    onProjectRootChanged: () => noopUnsub,
    onPluginProgress: () => noopUnsub,
    onIdeWorkspaceFsChanged: () => noopUnsub,
    onRunContributionCommand: () => noopUnsub,
    sendClientLog: () => {},
    assetUrl: () => "nodex-asset:browser-dev-unavailable",
    nodexUndo: async () => ({
      ok: false as const,
      error: "No host",
      touchedNotes: false as const,
    }),
    nodexRedo: async () => ({
      ok: false as const,
      error: "No host",
      touchedNotes: false as const,
    }),
    addWorkspaceFolder: async () => ({ ok: false as const, cancelled: true }),
    selectProjectFolder: async () => ({ ok: false as const, cancelled: true }),
    openProjectPath: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    refreshWorkspace: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    removeWorkspaceRoot: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    swapWorkspaceBlock: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    setWorkspaceFolderLabel: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    revealProjectFolderInExplorer: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    toggleDeveloperTools: async () => ({ success: false }),
    quitApp: async () => ({ success: false }),
    reloadWindow: async () => ({ success: false }),
    listAssets: async () => ({
      ok: true as const,
      entries: [],
    }),
    listAssetsByCategory: async () => ({
      ok: true as const,
      files: [],
    }),
    getAssetInfo: async () => null,
    readAssetText: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    openAssetExternal: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    moveProjectAsset: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    revealAssetInFileManager: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    pickImportMediaFile: async () => ({
      ok: false as const,
      error: "Not available in plain browser",
    }),
    getInstalledPlugins: async () => [],
    getPluginInventory: async () => [],
    getDisabledPluginIds: async () => [],
    getPluginLoadIssues: async () => [],
    getPluginCacheStats: async () => ({
      root: "",
      totalBytes: 0,
      plugins: [],
    }),
    getUserPluginsDirectory: async () => ({
      path: "",
      error: "Not available in plain browser",
    }),
    validatePluginZip: async () => ({
      valid: false,
      errors: ["Not available in plain browser"],
      warnings: [],
    }),
    importPlugin: async () => ({
      success: false,
      error: "Not available in plain browser",
    }),
    setPluginEnabled: async () => ({
      success: false,
      error: "Not available in plain browser",
    }),
    reloadPluginRegistry: async () => ({
      success: false,
      error: "Not available in plain browser",
    }),
    uninstallPlugin: async () => ({
      success: false,
      error: "Not available in plain browser",
    }),
    selectZipFile: async () => null,
    getComponent: async () => null,
    getPluginHTML: async () => null,
    getPluginRendererUiMeta: async () => null,
    getPluginManifestUi: async () => null,
    createNote: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    renameNote: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    deleteNotes: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    moveNote: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    moveNotesBulk: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    pasteSubtree: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    saveNotePluginUiState: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
    saveNoteContent: async () => {
      throw new Error(
        "Not available in plain browser — use Electron or ?web=1&api=…",
      );
    },
  };

  return new Proxy(impl as NodexRendererApi, {
    get(target, prop, receiver) {
      if (prop === "then") {
        return undefined;
      }
      if (
        prop in target &&
        target[prop as keyof NodexRendererApi] !== undefined
      ) {
        return Reflect.get(target, prop, receiver);
      }
      const key = String(prop);
      if (key.startsWith("on") && key.length > 3) {
        return () => noopUnsub;
      }
      return (..._args: unknown[]) =>
        Promise.reject(
          new Error(
            `[Nodex] ${key} is only available in Electron or with ?web=1&api=… (headless API).`,
          ),
        );
    },
  });
}

export function installNodexWebShimIfNeeded(): void {
  if (typeof window === "undefined") {
    return;
  }
  const w = window as Window & { Nodex?: NodexRendererApi };
  if (w.Nodex) {
    return;
  }
  const base = window.__NODEX_WEB_API_BASE__?.trim();
  window.Nodex = base ? createWebNodexApi(base) : createPlainBrowserDevStub();
}
