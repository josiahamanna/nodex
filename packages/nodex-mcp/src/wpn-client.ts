import type { McpTokenHolder } from "./mcp-token-holder.js";

/** Default TTL for `GET /wpn/notes-with-context` in-process cache (ms). */
const DEFAULT_NOTES_WITH_CONTEXT_TTL_MS = 2500;

export type WpnHttpClientOptions = {
  /** How long to reuse the notes-with-context catalog; invalidated on note PATCH/POST. */
  notesWithContextTtlMs?: number;
  /** Called after refresh (or login) updates tokens so MCP can persist. */
  onTokensUpdated?: (access: string, refresh: string | null) => void;
};

export type WpnNoteWithContextRow = {
  id: string;
  title: string;
  type: string;
  project_id: string;
  project_name: string;
  workspace_id: string;
  workspace_name: string;
};

export type WpnNoteDetail = {
  id: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  sibling_index: number;
  created_at_ms: number;
  updated_at_ms: number;
};

/** One row from `GET /wpn/projects/:projectId/notes` (preorder flat list). */
export type WpnNoteListItem = {
  id: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  depth: number;
  sibling_index: number;
};

function isWpnNoteListItem(x: unknown): x is WpnNoteListItem {
  if (x === null || typeof x !== "object") {
    return false;
  }
  const o = x as Record<string, unknown>;
  const pid = o.parent_id;
  return (
    typeof o.id === "string" &&
    typeof o.project_id === "string" &&
    (pid === null || typeof pid === "string") &&
    typeof o.type === "string" &&
    typeof o.title === "string" &&
    typeof o.depth === "number" &&
    Number.isFinite(o.depth) &&
    typeof o.sibling_index === "number" &&
    Number.isFinite(o.sibling_index)
  );
}

export function parseWpnNoteListItems(raw: unknown[], errLabel: string): WpnNoteListItem[] {
  const out: WpnNoteListItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!isWpnNoteListItem(item)) {
      throw new Error(`${errLabel}: invalid note list item at index ${i}`);
    }
    out.push(item);
  }
  return out;
}

export class WpnHttpClient {
  private readonly notesWithContextTtlMs: number;
  private readonly onTokensUpdated?: WpnHttpClientOptions["onTokensUpdated"];
  private notesWithContextCache: { fetchedAtMs: number; rows: WpnNoteWithContextRow[] } | null =
    null;

  constructor(
    private readonly baseUrl: string,
    private readonly holder: McpTokenHolder,
    opts: WpnHttpClientOptions = {},
  ) {
    this.notesWithContextTtlMs =
      opts.notesWithContextTtlMs ?? DEFAULT_NOTES_WITH_CONTEXT_TTL_MS;
    this.onTokensUpdated = opts.onTokensUpdated;
  }

  getHolder(): McpTokenHolder {
    return this.holder;
  }

  /** Clear notes-with-context cache (e.g. after logout). */
  invalidateNotesWithContextCache(): void {
    this.notesWithContextCache = null;
  }

  private invalidateNotesWithContextCacheInternal(): void {
    this.notesWithContextCache = null;
  }

  private url(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  private authHeaders(): HeadersInit {
    const h: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.holder.accessToken) {
      h.Authorization = `Bearer ${this.holder.accessToken}`;
    }
    return h;
  }

  private async tryRefresh(): Promise<boolean> {
    const rt = this.holder.refreshToken;
    if (!rt) {
      return false;
    }
    const res = await fetch(this.url("/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    if (!res.ok) {
      return false;
    }
    let body: { token?: string; refreshToken?: string };
    try {
      body = (await res.json()) as { token?: string; refreshToken?: string };
    } catch {
      return false;
    }
    if (typeof body.token !== "string" || !body.token.trim()) {
      return false;
    }
    const newRt =
      typeof body.refreshToken === "string" && body.refreshToken.trim()
        ? body.refreshToken.trim()
        : rt;
    this.holder.setTokens(body.token.trim(), newRt);
    this.onTokensUpdated?.(this.holder.accessToken, this.holder.refreshToken);
    return true;
  }

  private async fetchWpn(
    path: string,
    method: string,
    errLabel: string,
    body?: unknown,
  ): Promise<{ res: Response; text: string; body: unknown }> {
    const doFetch = () =>
      fetch(this.url(path), {
        method,
        headers: this.authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    let res = await doFetch();
    let text = await res.text();
    if (res.status === 401 && this.holder.refreshToken) {
      const ok = await this.tryRefresh();
      if (ok) {
        res = await doFetch();
        text = await res.text();
      }
    }
    if (res.status === 401) {
      throw new Error("NODEX_UNAUTHORIZED");
    }
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${errLabel}: invalid JSON (${res.status})`);
    }
    return { res, text, body: parsed };
  }

  private async getJson<T>(path: string, errLabel: string): Promise<T> {
    const { res, text, body } = await this.fetchWpn(path, "GET", errLabel);
    if (!res.ok) {
      const err = (body as { error?: string })?.error ?? text.slice(0, 200);
      throw new Error(`${errLabel} failed (${res.status}): ${err}`);
    }
    return body as T;
  }

  async getWorkspaces(): Promise<unknown[]> {
    const body = await this.getJson<{ workspaces?: unknown }>(
      "/wpn/workspaces",
      "WPN GET workspaces",
    );
    const ws = body.workspaces;
    if (!Array.isArray(ws)) {
      throw new Error("WPN GET workspaces: missing workspaces array");
    }
    return ws;
  }

  async getProjects(workspaceId: string): Promise<unknown[]> {
    const body = await this.getJson<{ projects?: unknown }>(
      `/wpn/workspaces/${encodeURIComponent(workspaceId)}/projects`,
      "WPN GET projects",
    );
    const p = body.projects;
    if (!Array.isArray(p)) {
      throw new Error("WPN GET projects: missing projects array");
    }
    return p;
  }

  async getNotesFlat(projectId: string): Promise<WpnNoteListItem[]> {
    const body = await this.getJson<{ notes?: unknown }>(
      `/wpn/projects/${encodeURIComponent(projectId)}/notes`,
      "WPN GET notes",
    );
    const n = body.notes;
    if (!Array.isArray(n)) {
      throw new Error("WPN GET notes: missing notes array");
    }
    return parseWpnNoteListItems(n, "WPN GET notes");
  }

  async getNotesWithContext(): Promise<WpnNoteWithContextRow[]> {
    const now = Date.now();
    const c = this.notesWithContextCache;
    if (
      c !== null &&
      this.notesWithContextTtlMs > 0 &&
      now - c.fetchedAtMs < this.notesWithContextTtlMs
    ) {
      return c.rows;
    }
    const body = await this.getJson<{ notes?: unknown }>(
      "/wpn/notes-with-context",
      "WPN GET notes-with-context",
    );
    const notes = body.notes;
    if (!Array.isArray(notes)) {
      throw new Error("WPN GET notes-with-context: missing notes array");
    }
    const rows = notes as WpnNoteWithContextRow[];
    this.notesWithContextCache = { fetchedAtMs: now, rows };
    return rows;
  }

  async getNote(noteId: string): Promise<WpnNoteDetail> {
    const { res, text, body } = await this.fetchWpn(
      `/wpn/notes/${encodeURIComponent(noteId)}`,
      "GET",
      "WPN get note",
    );
    if (!res.ok) {
      const err = (body as { error?: string })?.error ?? text.slice(0, 200);
      throw new Error(`WPN GET note failed (${res.status}): ${err}`);
    }
    const note = (body as { note?: WpnNoteDetail }).note;
    if (!note || typeof note !== "object") {
      throw new Error("WPN GET note: missing note object");
    }
    return note;
  }

  async patchNote(
    noteId: string,
    patch: {
      title?: string;
      content?: string;
      type?: string;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<WpnNoteDetail> {
    const { res, text, body } = await this.fetchWpn(
      `/wpn/notes/${encodeURIComponent(noteId)}`,
      "PATCH",
      "WPN patch note",
      patch,
    );
    if (!res.ok) {
      if (res.status === 409) {
        const msg = (body as { error?: string })?.error;
        if (typeof msg === "string" && msg.trim()) {
          throw new Error(msg.trim());
        }
      }
      const err = (body as { error?: string })?.error ?? text.slice(0, 200);
      throw new Error(`WPN PATCH note failed (${res.status}): ${err}`);
    }
    const note = (body as { note?: WpnNoteDetail }).note;
    if (!note) {
      throw new Error("WPN PATCH note: missing note in response");
    }
    this.invalidateNotesWithContextCacheInternal();
    return note;
  }

  async createNote(
    projectId: string,
    body: {
      type: string;
      relation: "root" | "child" | "sibling";
      anchorId?: string;
      title?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{ id: string }> {
    const { res, text, body: parsed } = await this.fetchWpn(
      `/wpn/projects/${encodeURIComponent(projectId)}/notes`,
      "POST",
      "WPN create note",
      body,
    );
    if (!res.ok) {
      const err = (parsed as { error?: string })?.error ?? text.slice(0, 200);
      throw new Error(`WPN POST note failed (${res.status}): ${err}`);
    }
    const id = (parsed as { id?: string }).id;
    if (typeof id !== "string" || !id) {
      throw new Error("WPN POST note: missing id in response");
    }
    this.invalidateNotesWithContextCacheInternal();
    return { id };
  }
}
