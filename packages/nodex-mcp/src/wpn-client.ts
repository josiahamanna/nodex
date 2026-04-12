import type { WpnHttpConfig } from "./config.js";

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

export class WpnHttpClient {
  constructor(private readonly cfg: WpnHttpConfig) {}

  private url(path: string): string {
    const p = path.startsWith("/") ? path : `/${path}`;
    return `${this.cfg.baseUrl}${p}`;
  }

  private headers(): HeadersInit {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.cfg.bearerToken}`,
    };
  }

  private async getJson<T>(path: string, errLabel: string): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "GET",
      headers: this.headers(),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${errLabel}: invalid JSON (${res.status})`);
    }
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

  async getNotesFlat(projectId: string): Promise<unknown[]> {
    const body = await this.getJson<{ notes?: unknown }>(
      `/wpn/projects/${encodeURIComponent(projectId)}/notes`,
      "WPN GET notes",
    );
    const n = body.notes;
    if (!Array.isArray(n)) {
      throw new Error("WPN GET notes: missing notes array");
    }
    return n;
  }

  async getNotesWithContext(): Promise<WpnNoteWithContextRow[]> {
    const body = await this.getJson<{ notes?: unknown }>(
      "/wpn/notes-with-context",
      "WPN GET notes-with-context",
    );
    const notes = body.notes;
    if (!Array.isArray(notes)) {
      throw new Error("WPN GET notes-with-context: missing notes array");
    }
    return notes as WpnNoteWithContextRow[];
  }

  async getNote(noteId: string): Promise<WpnNoteDetail> {
    const res = await fetch(this.url(`/wpn/notes/${encodeURIComponent(noteId)}`), {
      method: "GET",
      headers: this.headers(),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`WPN get note: invalid JSON (${res.status})`);
    }
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
    const res = await fetch(this.url(`/wpn/notes/${encodeURIComponent(noteId)}`), {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(patch),
    });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`WPN patch note: invalid JSON (${res.status})`);
    }
    if (!res.ok) {
      const err = (body as { error?: string })?.error ?? text.slice(0, 200);
      throw new Error(`WPN PATCH note failed (${res.status}): ${err}`);
    }
    const note = (body as { note?: WpnNoteDetail }).note;
    if (!note) {
      throw new Error("WPN PATCH note: missing note in response");
    }
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
    const res = await fetch(
      this.url(`/wpn/projects/${encodeURIComponent(projectId)}/notes`),
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      },
    );
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`WPN create note: invalid JSON (${res.status})`);
    }
    if (!res.ok) {
      const err = (parsed as { error?: string })?.error ?? text.slice(0, 200);
      throw new Error(`WPN POST note failed (${res.status}): ${err}`);
    }
    const id = (parsed as { id?: string }).id;
    if (typeof id !== "string" || !id) {
      throw new Error("WPN POST note: missing id in response");
    }
    return { id };
  }
}
