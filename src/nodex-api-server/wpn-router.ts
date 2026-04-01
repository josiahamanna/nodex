import { Router, type Request, type Response } from "express";
import type { Database } from "better-sqlite3";
import { getNotesDatabase } from "../core/notes-sqlite";
import { assertProjectOpen } from "./headless-bootstrap";
import { ensureWpnPgSchema } from "../core/wpn/wpn-pg-schema";
import { getWpnPgPool } from "../core/wpn/wpn-pg-pool";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import {
  wpnSqliteCreateProject,
  wpnSqliteCreateWorkspace,
  wpnSqliteDeleteProject,
  wpnSqliteDeleteWorkspace,
  wpnSqliteListProjects,
  wpnSqliteListWorkspaces,
  wpnSqliteUpdateProject,
  wpnSqliteUpdateWorkspace,
} from "../core/wpn/wpn-sqlite-service";
import {
  wpnPgCreateProject,
  wpnPgCreateWorkspace,
  wpnPgDeleteProject,
  wpnPgDeleteWorkspace,
  wpnPgListProjects,
  wpnPgListWorkspaces,
  wpnPgUpdateProject,
  wpnPgUpdateWorkspace,
} from "../core/wpn/wpn-pg-service";
import {
  wpnPgCreateNote,
  wpnPgDeleteNotes,
  wpnPgGetExplorerExpanded,
  wpnPgGetNoteById,
  wpnPgListNotesFlat,
  wpnPgMoveNote,
  wpnPgSetExplorerExpanded,
  wpnPgUpdateNote,
} from "../core/wpn/wpn-pg-notes";
import {
  wpnSqliteCreateNote,
  wpnSqliteDeleteNotes,
  wpnSqliteGetExplorerExpanded,
  wpnSqliteGetNoteById,
  wpnSqliteListNotesFlat,
  wpnSqliteMoveNote,
  wpnSqliteSetExplorerExpanded,
  wpnSqliteUpdateNote,
} from "../core/wpn/wpn-sqlite-notes";
import type { Pool } from "pg";
import { headlessSelectableNoteTypes } from "./headless-bootstrap";
import { isValidNoteType } from "../shared/validators";
import type { NoteMovePlacement } from "../shared/nodex-renderer-api";

type WpnBackend =
  | { kind: "sqlite"; db: Database }
  | { kind: "postgres"; pool: Pool };

let pgSchemaReady: Promise<void> | null = null;

async function resolveBackend(): Promise<WpnBackend> {
  const pool = getWpnPgPool();
  if (pool) {
    if (!pgSchemaReady) {
      pgSchemaReady = ensureWpnPgSchema(pool);
    }
    await pgSchemaReady;
    return { kind: "postgres", pool };
  }
  assertProjectOpen();
  const db = getNotesDatabase();
  if (!db) {
    throw new Error("Notes database is not open");
  }
  return { kind: "sqlite", db };
}

function sendErr(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * Workspace / project (v2) API — same JSON for SQLite (Electron project DB) and Postgres (web).
 * Mount at `/wpn` under `/api/v1`.
 */
export function createWpnRouter(): Router {
  const wpn = Router();

  wpn.get("/workspaces", async (_req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const b = await resolveBackend();
      const workspaces =
        b.kind === "postgres"
          ? await wpnPgListWorkspaces(b.pool, ownerId)
          : wpnSqliteListWorkspaces(b.db, ownerId);
      res.json({ workspaces });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/workspaces", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const name = typeof req.body?.name === "string" ? req.body.name : "Workspace";
      const b = await resolveBackend();
      const workspace =
        b.kind === "postgres"
          ? await wpnPgCreateWorkspace(b.pool, ownerId, name)
          : wpnSqliteCreateWorkspace(b.db, ownerId, name);
      res.status(201).json({ workspace });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/workspaces/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { id } = req.params;
      const body = req.body ?? {};
      const patch: {
        name?: string;
        sort_index?: number;
        color_token?: string | null;
      } = {};
      if (typeof body.name === "string") patch.name = body.name;
      if (typeof body.sort_index === "number") patch.sort_index = body.sort_index;
      if (body.color_token === null || typeof body.color_token === "string") {
        patch.color_token = body.color_token;
      }
      const b = await resolveBackend();
      const workspace =
        b.kind === "postgres"
          ? await wpnPgUpdateWorkspace(b.pool, ownerId, id, patch)
          : wpnSqliteUpdateWorkspace(b.db, ownerId, id, patch);
      if (!workspace) {
        sendErr(res, 404, "Workspace not found");
        return;
      }
      res.json({ workspace });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.delete("/workspaces/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { id } = req.params;
      const b = await resolveBackend();
      const ok =
        b.kind === "postgres"
          ? await wpnPgDeleteWorkspace(b.pool, ownerId, id)
          : wpnSqliteDeleteWorkspace(b.db, ownerId, id);
      if (!ok) {
        sendErr(res, 404, "Workspace not found");
        return;
      }
      res.json({ ok: true as const });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/workspaces/:workspaceId/projects", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { workspaceId } = req.params;
      const b = await resolveBackend();
      const projects =
        b.kind === "postgres"
          ? await wpnPgListProjects(b.pool, ownerId, workspaceId)
          : wpnSqliteListProjects(b.db, ownerId, workspaceId);
      res.json({ projects });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/workspaces/:workspaceId/projects", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { workspaceId } = req.params;
      const name = typeof req.body?.name === "string" ? req.body.name : "Project";
      const b = await resolveBackend();
      const project =
        b.kind === "postgres"
          ? await wpnPgCreateProject(b.pool, ownerId, workspaceId, name)
          : wpnSqliteCreateProject(b.db, ownerId, workspaceId, name);
      if (!project) {
        sendErr(res, 404, "Workspace not found");
        return;
      }
      res.status(201).json({ project });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/projects/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { id } = req.params;
      const body = req.body ?? {};
      const patch: {
        name?: string;
        sort_index?: number;
        color_token?: string | null;
        workspace_id?: string;
      } = {};
      if (typeof body.name === "string") patch.name = body.name;
      if (typeof body.sort_index === "number") patch.sort_index = body.sort_index;
      if (body.color_token === null || typeof body.color_token === "string") {
        patch.color_token = body.color_token;
      }
      if (typeof body.workspace_id === "string") patch.workspace_id = body.workspace_id;
      const b = await resolveBackend();
      const project =
        b.kind === "postgres"
          ? await wpnPgUpdateProject(b.pool, ownerId, id, patch)
          : wpnSqliteUpdateProject(b.db, ownerId, id, patch);
      if (!project) {
        sendErr(res, 404, "Project not found");
        return;
      }
      res.json({ project });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.delete("/projects/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { id } = req.params;
      const b = await resolveBackend();
      const ok =
        b.kind === "postgres"
          ? await wpnPgDeleteProject(b.pool, ownerId, id)
          : wpnSqliteDeleteProject(b.db, ownerId, id);
      if (!ok) {
        sendErr(res, 404, "Project not found");
        return;
      }
      res.json({ ok: true as const });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/projects/:projectId/notes", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { projectId } = req.params;
      const b = await resolveBackend();
      const notes =
        b.kind === "postgres"
          ? await wpnPgListNotesFlat(b.pool, ownerId, projectId)
          : wpnSqliteListNotesFlat(b.db, ownerId, projectId);
      res.json({ notes });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/projects/:projectId/explorer-state", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { projectId } = req.params;
      const b = await resolveBackend();
      const expanded_ids =
        b.kind === "postgres"
          ? await wpnPgGetExplorerExpanded(b.pool, ownerId, projectId)
          : wpnSqliteGetExplorerExpanded(b.db, ownerId, projectId);
      res.json({ expanded_ids });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/projects/:projectId/explorer-state", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { projectId } = req.params;
      const raw = req.body?.expanded_ids;
      const expanded_ids = Array.isArray(raw)
        ? raw.filter((x: unknown): x is string => typeof x === "string")
        : [];
      const b = await resolveBackend();
      if (b.kind === "postgres") {
        await wpnPgSetExplorerExpanded(b.pool, ownerId, projectId, expanded_ids);
      } else {
        wpnSqliteSetExplorerExpanded(b.db, ownerId, projectId, expanded_ids);
      }
      res.json({ expanded_ids });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/projects/:projectId/notes", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { projectId } = req.params;
      const body = req.body ?? {};
      const type = typeof body.type === "string" ? body.type : "";
      const selectable = headlessSelectableNoteTypes();
      if (!isValidNoteType(type) || !selectable.includes(type)) {
        sendErr(res, 400, "Invalid note type");
        return;
      }
      const rel = body.relation;
      if (rel !== "child" && rel !== "sibling" && rel !== "root") {
        sendErr(res, 400, "Invalid relation");
        return;
      }
      const anchorId = typeof body.anchorId === "string" ? body.anchorId : undefined;
      const b = await resolveBackend();
      const created =
        b.kind === "postgres"
          ? await wpnPgCreateNote(b.pool, ownerId, projectId, {
              anchorId: rel === "root" ? undefined : anchorId,
              relation: rel,
              type,
              content: typeof body.content === "string" ? body.content : undefined,
              title: typeof body.title === "string" ? body.title : undefined,
            })
          : wpnSqliteCreateNote(b.db, ownerId, projectId, {
              anchorId: rel === "root" ? undefined : anchorId,
              relation: rel,
              type,
              content: typeof body.content === "string" ? body.content : undefined,
              title: typeof body.title === "string" ? body.title : undefined,
            });
      res.status(201).json(created);
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/notes/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { id } = req.params;
      const b = await resolveBackend();
      const note =
        b.kind === "postgres"
          ? await wpnPgGetNoteById(b.pool, ownerId, id)
          : wpnSqliteGetNoteById(b.db, ownerId, id);
      if (!note) {
        sendErr(res, 404, "Note not found");
        return;
      }
      res.json({ note });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/notes/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const { id } = req.params;
      const body = req.body ?? {};
      const patch: {
        title?: string;
        content?: string;
        type?: string;
        metadata?: Record<string, unknown> | null;
      } = {};
      if (typeof body.title === "string") patch.title = body.title;
      if (typeof body.content === "string") patch.content = body.content;
      if (typeof body.type === "string") patch.type = body.type;
      if (body.metadata === null || (body.metadata && typeof body.metadata === "object")) {
        patch.metadata = body.metadata as Record<string, unknown> | null;
      }
      const b = await resolveBackend();
      const note =
        b.kind === "postgres"
          ? await wpnPgUpdateNote(b.pool, ownerId, id, patch)
          : wpnSqliteUpdateNote(b.db, ownerId, id, patch);
      if (!note) {
        sendErr(res, 404, "Note not found");
        return;
      }
      res.json({ note });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/notes/delete", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const raw = req.body?.ids;
      if (!Array.isArray(raw)) {
        sendErr(res, 400, "Expected ids array");
        return;
      }
      const ids = raw.filter((x: unknown): x is string => typeof x === "string");
      const b = await resolveBackend();
      if (b.kind === "postgres") {
        await wpnPgDeleteNotes(b.pool, ownerId, ids);
      } else {
        wpnSqliteDeleteNotes(b.db, ownerId, ids);
      }
      res.json({ ok: true as const });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/notes/move", async (req: Request, res: Response) => {
    try {
      const ownerId = getWpnOwnerId();
      const body = req.body ?? {};
      const projectId = typeof body.projectId === "string" ? body.projectId : "";
      const draggedId = typeof body.draggedId === "string" ? body.draggedId : "";
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const p = body.placement;
      if (!projectId || !draggedId || !targetId) {
        sendErr(res, 400, "projectId, draggedId, targetId required");
        return;
      }
      if (p !== "before" && p !== "after" && p !== "into") {
        sendErr(res, 400, "Invalid placement");
        return;
      }
      const b = await resolveBackend();
      if (b.kind === "postgres") {
        await wpnPgMoveNote(
          b.pool,
          ownerId,
          projectId,
          draggedId,
          targetId,
          p as NoteMovePlacement,
        );
      } else {
        wpnSqliteMoveNote(
          b.db,
          ownerId,
          projectId,
          draggedId,
          targetId,
          p as NoteMovePlacement,
        );
      }
      res.json({ ok: true as const });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  return wpn;
}
