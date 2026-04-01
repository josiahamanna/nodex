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

export function installNodexWebShimIfNeeded(): void {
  if (typeof window === "undefined") {
    return;
  }
  const w = window as Window & { Nodex?: NodexRendererApi };
  if (w.Nodex) {
    return;
  }
  const base = window.__NODEX_WEB_API_BASE__?.trim();
  if (!base) {
    return;
  }
  window.Nodex = createWebNodexApi(base);
}
