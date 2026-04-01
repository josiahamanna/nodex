import type {
  MarketplaceListResponse,
  NodexRendererApi,
} from "../shared/nodex-renderer-api";

const noopUnsub = (): void => {};

/** Dispatched after headless marketplace session-install so UI refreshes note types. */
export const NODEX_WEB_PLUGINS_CHANGED = "nodex-web-plugins-changed";

/** Persisted headless API origin for `?web=1` (no `api=` query needed). */
export const NODEX_WEB_HEADLESS_API_STORAGE_KEY = "nodex-headless-api-base";

export type HeadlessApiPreset = { label: string; value: string };

export function normalizeHeadlessApiBase(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** Presets for the web UI dropdown (call from client components so dev proxy uses current host). */
export function getHeadlessApiPresetOptions(): HeadlessApiPreset[] {
  const opts: HeadlessApiPreset[] = [
    { label: "127.0.0.1:3847", value: "http://127.0.0.1:3847" },
    { label: "localhost:3847", value: "http://localhost:3847" },
  ];
  if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const origin = normalizeHeadlessApiBase(window.location.origin);
    opts.unshift({
      label: `${window.location.host} (dev proxy)`,
      value: origin,
    });
  }
  return opts;
}

/**
 * Resolve `window.__NODEX_WEB_API_BASE__` before `installNodexWebShimIfNeeded` (Next / plain browser only).
 * Order: `api` query → localStorage → if `?web=1`: dev same-origin (proxy) or http://127.0.0.1:3847.
 * Without `web=1` and no saved `api`, leaves unset so the Market tab can prompt via dropdown.
 */
export function initHeadlessWebApiBaseFromUrlAndStorage(): void {
  if (typeof window === "undefined") {
    return;
  }
  const q = new URLSearchParams(window.location.search);
  const web = q.get("web") === "1" || q.get("web") === "true";

  const api = q.get("api")?.trim();
  if (api) {
    window.__NODEX_WEB_API_BASE__ = normalizeHeadlessApiBase(api);
    return;
  }
  try {
    const s = localStorage.getItem(NODEX_WEB_HEADLESS_API_STORAGE_KEY)?.trim();
    if (s) {
      window.__NODEX_WEB_API_BASE__ = normalizeHeadlessApiBase(s);
      return;
    }
  } catch {
    /* private mode */
  }
  if (!web) {
    return;
  }
  if (process.env.NODE_ENV === "development") {
    window.__NODEX_WEB_API_BASE__ = normalizeHeadlessApiBase(
      window.location.origin,
    );
  } else {
    window.__NODEX_WEB_API_BASE__ = "http://127.0.0.1:3847";
  }
}

/** True when the UI runs in Electron (hide browser-only headless controls). */
export function isElectronUserAgent(): boolean {
  return (
    typeof navigator !== "undefined" && navigator.userAgent.includes("Electron")
  );
}

function pickOneFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      resolve(input.files && input.files.length > 0 ? input.files[0]! : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

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
    const isHtml = /<\s*html[\s>]/i.test(text) || /<\s*!doctype/i.test(text);
    if (isHtml && /cannot\s+post/i.test(msg)) {
      msg = `${msg.trim()}\n\nThe server has no route for this request. Restart the headless API from this repo (\`npm run start:api\`) or rebuild the API image so it includes POST /api/v1/marketplace/session-install.`;
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
 * Set `window.__NODEX_WEB_API_BASE__` via `initHeadlessWebApiBaseFromUrlAndStorage()` or the web API bar before the bundle runs.
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
    getPluginHTML: async (type, note) => {
      const r = await req<{ html: string }>("POST", "/plugins/render-html", {
        type,
        note,
      });
      return r.html;
    },
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
    getShellLayout: async () => {
      const r = await req<{ layout: unknown }>("GET", "/project/shell-layout");
      return r?.layout ?? null;
    },
    setShellLayout: (layout) => req("POST", "/project/shell-layout", { layout }),
    getAppPrefs: async () => ({ seedSampleNotes: true }),
    nodexUndo: () => req("POST", "/undo"),
    nodexRedo: () => req("POST", "/redo"),
    listMarketplacePlugins: () =>
      req<MarketplaceListResponse>("GET", "/marketplace/plugins"),
    installMarketplacePlugin: async (packageFile) => {
      const out = await req<{
        success: boolean;
        error?: string;
        warnings?: string[];
      }>("POST", "/marketplace/session-install", { packageFile });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(NODEX_WEB_PLUGINS_CHANGED));
      }
      return (
        out ?? {
          success: false,
          error: "Empty response from marketplace/session-install",
        }
      );
    },
    getPluginRendererUiMeta: async (noteType) => {
      const root = baseUrl.replace(/\/$/, "");
      const u = `${root}/api/v1/plugins/renderer-meta?type=${encodeURIComponent(noteType)}`;
      const res = await fetch(u);
      if (!res.ok) {
        return null;
      }
      const text = await res.text();
      if (!text.length) {
        return null;
      }
      const j = JSON.parse(text) as {
        theme?: string;
        deferDisplayUntilContentReady?: boolean;
        designSystemVersion?: string | null;
      } | null;
      if (!j || typeof j !== "object") {
        return null;
      }
      return {
        theme: j.theme === "isolated" ? "isolated" : "inherit",
        deferDisplayUntilContentReady: j.deferDisplayUntilContentReady === true,
        designSystemVersion: j.designSystemVersion ?? undefined,
      };
    },
    getUserPluginsDirectory: async () => ({
      path: "",
      error: "User plugin folder is only available in the Nodex desktop app.",
    }),
    selectZipFile: async () => null,
    validatePluginZip: async () => ({
      valid: false,
      errors: ["Not available in web mode — use the desktop app to validate zips."],
      warnings: [],
    }),
    importPlugin: async () => ({
      success: false,
      error: "Plugin import requires the Nodex desktop app.",
    }),
    deletePluginBinAndCaches: async () => ({
      success: false,
      error: "Not available in web mode.",
    }),
    deleteAllPluginSources: async () => ({
      success: false,
      error: "Not available in web mode.",
    }),
    formatNodexPluginData: async () => ({
      success: false,
      error: "Not available in web mode.",
    }),
    getInstalledPlugins: async () => [],
    getPluginInventory: async () => [],
    getDisabledPluginIds: async () => [],
    setPluginEnabled: async () => ({
      success: false,
      error: "Not available in web mode.",
    }),
    uninstallPlugin: async () => ({
      success: false,
      error: "Not available in web mode.",
    }),
    onPluginsChanged: (callback) => {
      if (typeof window === "undefined") {
        return noopUnsub;
      }
      const fn = () => callback();
      window.addEventListener(NODEX_WEB_PLUGINS_CHANGED, fn);
      return () => window.removeEventListener(NODEX_WEB_PLUGINS_CHANGED, fn);
    },
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

/** Switch headless API origin at runtime (Next web shell); persists to localStorage. */
export function applyHeadlessApiBase(raw: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const base = normalizeHeadlessApiBase(raw);
  if (!/^https?:\/\/.+/i.test(base)) {
    return;
  }
  window.__NODEX_WEB_API_BASE__ = base;
  try {
    localStorage.setItem(NODEX_WEB_HEADLESS_API_STORAGE_KEY, base);
  } catch {
    /* private mode */
  }
  window.Nodex = createWebNodexApi(base);
  window.dispatchEvent(new Event(NODEX_WEB_PLUGINS_CHANGED));
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
    getShellLayout: async () => null,
    setShellLayout: async () => ({ ok: false as const, error: "No host" }),
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
    assetUrl: (relativePath) => {
      if (typeof window === "undefined") {
        return "nodex-asset:browser-dev-unavailable";
      }
      const rel = String(relativePath || "").replace(/^\/+/, "");
      const parts = rel.split("/").map((p) => encodeURIComponent(p));
      return `${window.location.origin}/api/v1/assets/file/${parts.join("/")}`;
    },
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
    pickImportMediaFile: async (category) => {
      if (typeof window === "undefined") {
        return { ok: false as const, error: "No window" };
      }
      const file = await pickOneFile("*/*");
      if (!file) {
        return { ok: false as const, error: "Cancelled" };
      }
      const root = normalizeHeadlessApiBase(window.location.origin);
      const url = `${root}/api/v1/assets/import-media`;
      const form = new FormData();
      form.append("category", String(category));
      form.append("file", file, file.name);
      const res = await fetch(url, { method: "POST", body: form });
      const text = await res.text();
      if (!res.ok) {
        return {
          ok: false as const,
          error: text || `Import failed (${res.status})`,
        };
      }
      const j = JSON.parse(text) as { ok: boolean; assetRel?: string; error?: string };
      if (!j.ok || !j.assetRel) {
        return { ok: false as const, error: j.error || "Import failed" };
      }
      return { ok: true as const, assetRel: j.assetRel };
    },
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
    listMarketplacePlugins: async () => ({
      filesBasePath: "",
      generatedAt: "",
      plugins: [],
      indexError:
        "Start the API (npm run start:api), then pick its URL under Market → Headless API (or use ?api= on the page URL).",
    }),
    installMarketplacePlugin: async () => ({
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
