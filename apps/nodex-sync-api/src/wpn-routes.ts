import type { FastifyInstance } from "fastify";
import { requireAuth } from "./auth.js";
import type { WpnNoteDoc, WpnProjectDoc, WpnWorkspaceDoc } from "./db.js";
import {
  getWpnExplorerStateCollection,
  getWpnNotesCollection,
  getWpnProjectsCollection,
  getWpnWorkspacesCollection,
} from "./db.js";

/** Minimal markdown link → note id extraction (mirrors repo `collectReferencedNoteIdsFromMarkdown` for P1 backlinks). */
function collectReferencedNoteIdsFromMarkdown(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const href = (m[2] ?? "").trim();
    const id = parseNoteIdFromInternalMarkdownHref(href);
    if (id) {
      out.add(id);
    }
  }
  return out;
}

function parseNoteIdFromInternalMarkdownHref(href: string): string | null {
  const raw = href.trim();
  if (!raw) {
    return null;
  }
  let path = raw;
  const hashIdx = path.indexOf("#");
  if (hashIdx >= 0) {
    path = path.slice(hashIdx + 1);
  }
  path = path.replace(/^\/+/, "");
  if (!path.startsWith("n/")) {
    return null;
  }
  const rest = path.slice("n/".length);
  const parts = rest
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const noteId = parts[0];
  return noteId ?? null;
}

/** Public row shape (no `settings` — use `/wpn/.../settings` like headless API). */
function workspaceRow(doc: WpnWorkspaceDoc): Omit<WpnWorkspaceDoc, "userId" | "settings"> {
  const { userId: _u, settings: _s, ...rest } = doc;
  return rest;
}

function projectRow(doc: WpnProjectDoc): Omit<WpnProjectDoc, "userId" | "settings"> {
  const { userId: _u, settings: _s, ...rest } = doc;
  return rest;
}

type WpnNoteListItemOut = {
  id: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  depth: number;
  sibling_index: number;
};

function listNotesFlatPreorder(rows: WpnNoteDoc[]): WpnNoteListItemOut[] {
  const active = rows.filter((r) => r.deleted !== true);
  const cm = new Map<string | null, WpnNoteDoc[]>();
  for (const r of active) {
    const k = r.parent_id;
    const arr = cm.get(k) ?? [];
    arr.push(r);
    cm.set(k, arr);
  }
  for (const arr of cm.values()) {
    arr.sort((a, b) => a.sibling_index - b.sibling_index);
  }
  const out: WpnNoteListItemOut[] = [];
  const visit = (parentId: string | null, depth: number): void => {
    const kids = cm.get(parentId) ?? [];
    for (const r of kids) {
      out.push({
        id: r.id,
        project_id: r.project_id,
        parent_id: r.parent_id,
        type: r.type,
        title: r.title,
        depth,
        sibling_index: r.sibling_index,
      });
      visit(r.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

export function registerWpnReadRoutes(
  app: FastifyInstance,
  opts: { jwtSecret: string },
): void {
  const { jwtSecret } = opts;

  app.get("/wpn/workspaces", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const userId = auth.sub;
    const col = getWpnWorkspacesCollection();
    const docs = await col
      .find({ userId })
      .sort({ sort_index: 1, name: 1 })
      .toArray();
    const workspaces = docs.map((d) => workspaceRow(d));
    return reply.send({ workspaces });
  });

  app.get("/wpn/workspaces/:workspaceId/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { workspaceId } = request.params as { workspaceId: string };
    const userId = auth.sub;
    const wsCol = getWpnWorkspacesCollection();
    const owned = await wsCol.findOne({ id: workspaceId, userId });
    if (!owned) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    const col = getWpnProjectsCollection();
    const docs = await col
      .find({ userId, workspace_id: workspaceId })
      .sort({ sort_index: 1, name: 1 })
      .toArray();
    const projects = docs.map((d) => projectRow(d));
    return reply.send({ projects });
  });

  app.get("/wpn/projects/:projectId/notes", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const userId = auth.sub;
    const projCol = getWpnProjectsCollection();
    const project = await projCol.findOne({ id: projectId, userId });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    const noteCol = getWpnNotesCollection();
    const rows = await noteCol.find({ userId, project_id: projectId }).toArray();
    const notes = listNotesFlatPreorder(rows);
    return reply.send({ notes });
  });

  /** Single round-trip flat list for all projects (same row shape as `GET /wpn/projects/:id/notes`). */
  app.get("/wpn/all-notes-list", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const userId = auth.sub;
    const wsCol = getWpnWorkspacesCollection();
    const projCol = getWpnProjectsCollection();
    const noteCol = getWpnNotesCollection();
    const workspaces = await wsCol
      .find({ userId })
      .sort({ sort_index: 1, name: 1 })
      .toArray();
    const out: WpnNoteListItemOut[] = [];
    for (const w of workspaces) {
      const projects = await projCol
        .find({ userId, workspace_id: w.id })
        .sort({ sort_index: 1, name: 1 })
        .toArray();
      for (const p of projects) {
        const rows = await noteCol.find({ userId, project_id: p.id }).toArray();
        out.push(...listNotesFlatPreorder(rows));
      }
    }
    return reply.send({ notes: out });
  });

  app.get("/wpn/notes-with-context", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const userId = auth.sub;
    const noteCol = getWpnNotesCollection();
    const projCol = getWpnProjectsCollection();
    const wsCol = getWpnWorkspacesCollection();
    const notes = await noteCol.find({ userId, deleted: { $ne: true } }).toArray();
    const out: {
      id: string;
      title: string;
      type: string;
      project_id: string;
      project_name: string;
      workspace_id: string;
      workspace_name: string;
    }[] = [];
    for (const n of notes) {
      const p = await projCol.findOne({ id: n.project_id, userId });
      if (!p) {
        continue;
      }
      const w = await wsCol.findOne({ id: p.workspace_id, userId });
      if (!w) {
        continue;
      }
      out.push({
        id: n.id,
        type: n.type,
        title: n.title,
        project_id: n.project_id,
        project_name: p.name,
        workspace_id: p.workspace_id,
        workspace_name: w.name,
      });
    }
    return reply.send({ notes: out });
  });

  app.get("/wpn/backlinks/:noteId", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { noteId } = request.params as { noteId: string };
    const userId = auth.sub;
    const noteCol = getWpnNotesCollection();
    const projCol = getWpnProjectsCollection();
    const wsCol = getWpnWorkspacesCollection();
    const candidates = await noteCol.find({ userId, deleted: { $ne: true } }).toArray();
    const sources: { id: string; title: string; project_id: string }[] = [];
    for (const n of candidates) {
      if (n.id === noteId) {
        continue;
      }
      const refs = collectReferencedNoteIdsFromMarkdown(n.content ?? "");
      if (!refs.has(noteId)) {
        continue;
      }
      const p = await projCol.findOne({ id: n.project_id, userId });
      if (!p) {
        continue;
      }
      const w = await wsCol.findOne({ id: p.workspace_id, userId });
      if (!w) {
        continue;
      }
      sources.push({ id: n.id, title: n.title, project_id: n.project_id });
    }
    return reply.send({ sources });
  });

  app.get("/wpn/projects/:projectId/explorer-state", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const userId = auth.sub;
    const projCol = getWpnProjectsCollection();
    const project = await projCol.findOne({ id: projectId, userId });
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    const exCol = getWpnExplorerStateCollection();
    const doc = await exCol.findOne({ userId, project_id: projectId });
    const expanded_ids = Array.isArray(doc?.expanded_ids) ? doc!.expanded_ids : [];
    return reply.send({ expanded_ids });
  });

  app.get("/wpn/notes/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const userId = auth.sub;
    const noteCol = getWpnNotesCollection();
    const n = await noteCol.findOne({ id, userId, deleted: { $ne: true } });
    if (!n) {
      return reply.status(404).send({ error: "Note not found" });
    }
    const projCol = getWpnProjectsCollection();
    const p = await projCol.findOne({ id: n.project_id, userId });
    if (!p) {
      return reply.status(404).send({ error: "Note not found" });
    }
    const wsCol = getWpnWorkspacesCollection();
    const w = await wsCol.findOne({ id: p.workspace_id, userId });
    if (!w) {
      return reply.status(404).send({ error: "Note not found" });
    }
    const note = {
      id: n.id,
      project_id: n.project_id,
      parent_id: n.parent_id,
      type: n.type,
      title: n.title,
      content: n.content,
      metadata:
        n.metadata && typeof n.metadata === "object" && !Array.isArray(n.metadata)
          ? n.metadata
          : undefined,
      sibling_index: n.sibling_index,
      created_at_ms: n.created_at_ms,
      updated_at_ms: n.updated_at_ms,
    };
    return reply.send({ note });
  });
}
