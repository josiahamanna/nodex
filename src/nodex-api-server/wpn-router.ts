import { Router, type Request, type Response } from "express";
import {
  getNotesDatabase,
  type WorkspaceStore,
} from "../core/workspace-store";
import { assertProjectOpen } from "./headless-bootstrap";
import type { AuthedRequest } from "./auth/auth-middleware";
import {
  wpnJsonCreateProject,
  wpnJsonCreateWorkspace,
  wpnJsonDeleteProject,
  wpnJsonDeleteWorkspace,
  wpnJsonListProjects,
  wpnJsonListWorkspaces,
  wpnJsonUpdateProject,
  wpnJsonUpdateWorkspace,
} from "../core/wpn/wpn-json-service";
import {
  wpnJsonCreateNote,
  wpnJsonDeleteNotes,
  wpnJsonGetExplorerExpanded,
  wpnJsonGetNoteById,
  wpnJsonListAllNotesWithContext,
  wpnJsonListBacklinksToNote,
  wpnJsonListNotesFlat,
  wpnJsonDuplicateNoteSubtree,
  wpnJsonMoveNote,
  wpnJsonSetExplorerExpanded,
  wpnJsonUpdateNote,
} from "../core/wpn/wpn-json-notes";
import {
  wpnJsonGetProjectSettings,
  wpnJsonGetWorkspaceSettings,
  wpnJsonPatchProjectSettings,
  wpnJsonPatchWorkspaceSettings,
} from "../core/wpn/wpn-json-settings";
import {
  wpnJsonApplyVfsRewritesAfterTitleChange,
  wpnJsonPreviewVfsRewritesAfterTitleChange,
} from "../core/wpn/wpn-rename-vfs-rewrite";
import { headlessSelectableNoteTypes } from "./headless-bootstrap";
import { normalizeLegacyNoteType } from "../shared/note-type-legacy";
import { isValidNoteType } from "../shared/validators";
import type { NoteMovePlacement } from "../shared/nodex-renderer-api";

async function resolveJsonStore(): Promise<WorkspaceStore> {
  assertProjectOpen();
  const store = getNotesDatabase();
  if (!store) {
    throw new Error("Workspace store is not open");
  }
  return store;
}

function sendErr(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message });
}

/**
 * Workspace / project (v2) API — JSON workspace file (`nodex-workspace.json`) under the open project.
 * Mount at `/wpn` under `/api/v1`.
 */
export function createWpnRouter(): Router {
  const wpn = Router();

  wpn.get("/workspaces", async (_req: Request, res: Response) => {
    try {
      const ownerId = (_req as AuthedRequest).user!.id;
      const store = await resolveJsonStore();
      const workspaces = wpnJsonListWorkspaces(store, ownerId);
      res.json({ workspaces });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/workspaces", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const name = typeof req.body?.name === "string" ? req.body.name : "Workspace";
      const store = await resolveJsonStore();
      const workspace = wpnJsonCreateWorkspace(store, ownerId, name);
      res.status(201).json({ workspace });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/workspaces/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
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
      const store = await resolveJsonStore();
      const workspace = wpnJsonUpdateWorkspace(store, ownerId, id, patch);
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
      const ownerId = (req as AuthedRequest).user!.id;
      const { id } = req.params;
      const store = await resolveJsonStore();
      const ok = wpnJsonDeleteWorkspace(store, ownerId, id);
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
      const ownerId = (req as AuthedRequest).user!.id;
      const { workspaceId } = req.params;
      const store = await resolveJsonStore();
      const projects = wpnJsonListProjects(store, ownerId, workspaceId);
      res.json({ projects });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/workspaces/:workspaceId/projects", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { workspaceId } = req.params;
      const name = typeof req.body?.name === "string" ? req.body.name : "Project";
      const store = await resolveJsonStore();
      const project = wpnJsonCreateProject(store, ownerId, workspaceId, name);
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
      const ownerId = (req as AuthedRequest).user!.id;
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
      const store = await resolveJsonStore();
      const project = wpnJsonUpdateProject(store, ownerId, id, patch);
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
      const ownerId = (req as AuthedRequest).user!.id;
      const { id } = req.params;
      const store = await resolveJsonStore();
      const ok = wpnJsonDeleteProject(store, ownerId, id);
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
      const ownerId = (req as AuthedRequest).user!.id;
      const { projectId } = req.params;
      const store = await resolveJsonStore();
      const notes = wpnJsonListNotesFlat(store, ownerId, projectId);
      res.json({ notes });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/notes-with-context", async (_req: Request, res: Response) => {
    try {
      const ownerId = (_req as AuthedRequest).user!.id;
      const store = await resolveJsonStore();
      const notes = wpnJsonListAllNotesWithContext(store, ownerId);
      res.json({ notes });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/backlinks/:noteId", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { noteId } = req.params;
      const store = await resolveJsonStore();
      const sources = wpnJsonListBacklinksToNote(store, ownerId, noteId);
      res.json({ sources });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/projects/:projectId/explorer-state", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { projectId } = req.params;
      const store = await resolveJsonStore();
      const expanded_ids = wpnJsonGetExplorerExpanded(store, ownerId, projectId);
      res.json({ expanded_ids });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/projects/:projectId/explorer-state", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { projectId } = req.params;
      const raw = req.body?.expanded_ids;
      const expanded_ids = Array.isArray(raw)
        ? raw.filter((x: unknown): x is string => typeof x === "string")
        : [];
      const store = await resolveJsonStore();
      wpnJsonSetExplorerExpanded(store, ownerId, projectId, expanded_ids);
      res.json({ expanded_ids });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/projects/:projectId/notes", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { projectId } = req.params;
      const body = req.body ?? {};
      const type =
        typeof body.type === "string" ? normalizeLegacyNoteType(body.type) : "";
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
      const store = await resolveJsonStore();
      const created = wpnJsonCreateNote(store, ownerId, projectId, {
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

  wpn.post("/notes/:id/preview-title-change", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { id } = req.params;
      const rawTitle = typeof req.body?.title === "string" ? req.body.title : "";
      const store = await resolveJsonStore();
      const before = wpnJsonGetNoteById(store, ownerId, id);
      if (!before) {
        sendErr(res, 404, "Note not found");
        return;
      }
      const nextTitle = rawTitle.trim() ? rawTitle.trim() : before.title;
      const preview = wpnJsonPreviewVfsRewritesAfterTitleChange(
        store,
        ownerId,
        id,
        before.title,
        nextTitle,
      );
      res.json({
        dependentNoteCount: preview.dependentNoteCount,
        dependentNoteIds: preview.dependentNoteIds,
      });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/notes/:id", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { id } = req.params;
      const store = await resolveJsonStore();
      const note = wpnJsonGetNoteById(store, ownerId, id);
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
      const ownerId = (req as AuthedRequest).user!.id;
      const { id } = req.params;
      const body = req.body ?? {};
      const updateVfsDependentLinks = body.updateVfsDependentLinks !== false;
      const patch: {
        title?: string;
        content?: string;
        type?: string;
        metadata?: Record<string, unknown> | null;
      } = {};
      if (typeof body.title === "string") patch.title = body.title;
      if (typeof body.content === "string") patch.content = body.content;
      if (typeof body.type === "string") {
        patch.type = normalizeLegacyNoteType(body.type);
      }
      if (body.metadata === null || (body.metadata && typeof body.metadata === "object")) {
        patch.metadata = body.metadata as Record<string, unknown> | null;
      }
      const store = await resolveJsonStore();
      const before =
        patch.title !== undefined ? wpnJsonGetNoteById(store, ownerId, id) : null;
      const note = wpnJsonUpdateNote(store, ownerId, id, patch);
      if (!note) {
        sendErr(res, 404, "Note not found");
        return;
      }
      if (
        updateVfsDependentLinks &&
        before &&
        patch.title !== undefined &&
        (patch.title.trim() || before.title) !== before.title
      ) {
        try {
          wpnJsonApplyVfsRewritesAfterTitleChange(
            store,
            ownerId,
            id,
            before.title,
            note.title,
          );
        } catch (vfsErr) {
          console.error("[wpn-router] VFS rewrite after title change:", vfsErr);
          throw vfsErr;
        }
      }
      res.json({ note });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post("/notes/delete", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const raw = req.body?.ids;
      if (!Array.isArray(raw)) {
        sendErr(res, 400, "Expected ids array");
        return;
      }
      const ids = raw.filter((x: unknown): x is string => typeof x === "string");
      const store = await resolveJsonStore();
      wpnJsonDeleteNotes(store, ownerId, ids);
      res.json({ ok: true as const });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.post(
    "/projects/:projectId/notes/:noteId/duplicate",
    async (req: Request, res: Response) => {
      try {
        const ownerId = (req as AuthedRequest).user!.id;
        const { projectId, noteId } = req.params;
        const store = await resolveJsonStore();
        const result = wpnJsonDuplicateNoteSubtree(store, ownerId, projectId, noteId);
        res.status(201).json(result);
      } catch (e) {
        sendErr(res, 503, e instanceof Error ? e.message : String(e));
      }
    },
  );

  wpn.post("/notes/move", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
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
      const store = await resolveJsonStore();
      wpnJsonMoveNote(
        store,
        ownerId,
        projectId,
        draggedId,
        targetId,
        p as NoteMovePlacement,
      );
      res.json({ ok: true as const });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/workspaces/:workspaceId/settings", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { workspaceId } = req.params;
      const store = await resolveJsonStore();
      const settings = wpnJsonGetWorkspaceSettings(store, ownerId, workspaceId);
      res.json({ settings });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/workspaces/:workspaceId/settings", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { workspaceId } = req.params;
      const patch = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const store = await resolveJsonStore();
      const settings = wpnJsonPatchWorkspaceSettings(store, ownerId, workspaceId, patch);
      res.json({ settings });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.get("/projects/:projectId/settings", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { projectId } = req.params;
      const store = await resolveJsonStore();
      const settings = wpnJsonGetProjectSettings(store, ownerId, projectId);
      res.json({ settings });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  wpn.patch("/projects/:projectId/settings", async (req: Request, res: Response) => {
    try {
      const ownerId = (req as AuthedRequest).user!.id;
      const { projectId } = req.params;
      const patch = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};
      const store = await resolveJsonStore();
      const settings = wpnJsonPatchProjectSettings(store, ownerId, projectId, patch);
      res.json({ settings });
    } catch (e) {
      sendErr(res, 503, e instanceof Error ? e.message : String(e));
    }
  });

  return wpn;
}
