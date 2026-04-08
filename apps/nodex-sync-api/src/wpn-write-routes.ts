import type { FastifyInstance, FastifyReply } from "fastify";
import { requireAuth } from "./auth.js";
import { getWpnProjectsCollection, getWpnWorkspacesCollection } from "./db.js";
import {
  mongoWpnCreateNote,
  mongoWpnCreateProject,
  mongoWpnCreateWorkspace,
  mongoWpnDeleteNotes,
  mongoWpnDeleteProject,
  mongoWpnDeleteWorkspace,
  mongoWpnDuplicateSubtree,
  mongoWpnGetProjectSettings,
  mongoWpnGetWorkspaceSettings,
  mongoWpnMoveNote,
  mongoWpnPatchProjectSettings,
  mongoWpnPatchWorkspaceSettings,
  mongoWpnSetExplorerExpanded,
  mongoWpnUpdateNote,
  mongoWpnUpdateProject,
  mongoWpnUpdateWorkspace,
} from "./wpn-mongo-writes.js";
import type { NoteMovePlacement } from "./wpn-tree.js";

function sendWpnError(reply: FastifyReply, e: unknown, fallbackStatus = 503) {
  const msg = e instanceof Error ? e.message : String(e);
  const status =
    /required|Invalid anchor|Invalid relation|Anchor note not found|Cannot move/i.test(msg)
      ? 400
      : fallbackStatus;
  return reply.status(status).send({ error: msg });
}

export function registerWpnWriteRoutes(
  app: FastifyInstance,
  opts: { jwtSecret: string },
): void {
  const { jwtSecret } = opts;

  app.post("/wpn/workspaces", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const name =
      typeof (request.body as { name?: unknown })?.name === "string"
        ? (request.body as { name: string }).name
        : "Workspace";
    try {
      const workspace = await mongoWpnCreateWorkspace(auth.sub, name);
      return reply.status(201).send({ workspace });
    } catch (e) {
      return sendWpnError(reply, e);
    }
  });

  app.patch("/wpn/workspaces/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: {
      name?: string;
      sort_index?: number;
      color_token?: string | null;
    } = {};
    if (typeof body.name === "string") {
      patch.name = body.name;
    }
    if (typeof body.sort_index === "number") {
      patch.sort_index = body.sort_index;
    }
    if (body.color_token === null || typeof body.color_token === "string") {
      patch.color_token = body.color_token as string | null;
    }
    const workspace = await mongoWpnUpdateWorkspace(auth.sub, id, patch);
    if (!workspace) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    return reply.send({ workspace });
  });

  app.delete("/wpn/workspaces/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const ok = await mongoWpnDeleteWorkspace(auth.sub, id);
    if (!ok) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    return reply.send({ ok: true as const });
  });

  app.post("/wpn/workspaces/:workspaceId/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { workspaceId } = request.params as { workspaceId: string };
    const name =
      typeof (request.body as { name?: unknown })?.name === "string"
        ? (request.body as { name: string }).name
        : "Project";
    const project = await mongoWpnCreateProject(auth.sub, workspaceId, name);
    if (!project) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    return reply.status(201).send({ project });
  });

  app.patch("/wpn/projects/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: {
      name?: string;
      sort_index?: number;
      color_token?: string | null;
      workspace_id?: string;
    } = {};
    if (typeof body.name === "string") {
      patch.name = body.name;
    }
    if (typeof body.sort_index === "number") {
      patch.sort_index = body.sort_index;
    }
    if (body.color_token === null || typeof body.color_token === "string") {
      patch.color_token = body.color_token as string | null;
    }
    if (typeof body.workspace_id === "string") {
      patch.workspace_id = body.workspace_id;
    }
    const project = await mongoWpnUpdateProject(auth.sub, id, patch);
    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.send({ project });
  });

  app.delete("/wpn/projects/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const ok = await mongoWpnDeleteProject(auth.sub, id);
    if (!ok) {
      return reply.status(404).send({ error: "Project not found" });
    }
    return reply.send({ ok: true as const });
  });

  app.post("/wpn/projects/:projectId/notes", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const type = typeof body.type === "string" ? body.type.trim() : "";
    if (!type) {
      return reply.status(400).send({ error: "Invalid note type" });
    }
    const rel = body.relation;
    if (rel !== "child" && rel !== "sibling" && rel !== "root") {
      return reply.status(400).send({ error: "Invalid relation" });
    }
    const anchorId = typeof body.anchorId === "string" ? body.anchorId : undefined;
    try {
      const created = await mongoWpnCreateNote(auth.sub, projectId, {
        anchorId: rel === "root" ? undefined : anchorId,
        relation: rel,
        type,
        content: typeof body.content === "string" ? body.content : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        metadata:
          body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      });
      return reply.status(201).send(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Project not found") {
        return reply.status(404).send({ error: msg });
      }
      return sendWpnError(reply, e, 400);
    }
  });

  app.patch("/wpn/notes/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: {
      title?: string;
      content?: string;
      type?: string;
      metadata?: Record<string, unknown> | null;
    } = {};
    if (typeof body.title === "string") {
      patch.title = body.title;
    }
    if (typeof body.content === "string") {
      patch.content = body.content;
    }
    if (typeof body.type === "string") {
      patch.type = body.type;
    }
    if (body.metadata === null || (body.metadata && typeof body.metadata === "object")) {
      patch.metadata = body.metadata as Record<string, unknown> | null;
    }
    const note = await mongoWpnUpdateNote(auth.sub, id, patch);
    if (!note) {
      return reply.status(404).send({ error: "Note not found" });
    }
    return reply.send({ note });
  });

  app.post("/wpn/notes/delete", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const raw = (request.body as { ids?: unknown })?.ids;
    if (!Array.isArray(raw)) {
      return reply.status(400).send({ error: "Expected ids array" });
    }
    const ids = raw.filter((x): x is string => typeof x === "string");
    await mongoWpnDeleteNotes(auth.sub, ids);
    return reply.send({ ok: true as const });
  });

  app.post("/wpn/notes/move", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const body = (request.body ?? {}) as Record<string, unknown>;
    const projectId = typeof body.projectId === "string" ? body.projectId : "";
    const draggedId = typeof body.draggedId === "string" ? body.draggedId : "";
    const targetId = typeof body.targetId === "string" ? body.targetId : "";
    const p = body.placement;
    if (!projectId || !draggedId || !targetId) {
      return reply.status(400).send({ error: "projectId, draggedId, targetId required" });
    }
    if (p !== "before" && p !== "after" && p !== "into") {
      return reply.status(400).send({ error: "Invalid placement" });
    }
    try {
      await mongoWpnMoveNote(
        auth.sub,
        projectId,
        draggedId,
        targetId,
        p as NoteMovePlacement,
      );
      return reply.send({ ok: true as const });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Project not found") {
        return reply.status(404).send({ error: msg });
      }
      return sendWpnError(reply, e, 400);
    }
  });

  app.post(
    "/wpn/projects/:projectId/notes/:noteId/duplicate",
    async (request, reply) => {
      const auth = await requireAuth(request, reply, jwtSecret);
      if (!auth) {
        return;
      }
      const { projectId, noteId } = request.params as {
        projectId: string;
        noteId: string;
      };
      try {
        const result = await mongoWpnDuplicateSubtree(auth.sub, projectId, noteId);
        return reply.status(201).send(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "Project not found") {
          return reply.status(404).send({ error: msg });
        }
        return sendWpnError(reply, e, 400);
      }
    },
  );

  app.patch("/wpn/projects/:projectId/explorer-state", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const raw = (request.body as { expanded_ids?: unknown })?.expanded_ids;
    const expanded_ids = Array.isArray(raw)
      ? raw.filter((x): x is string => typeof x === "string")
      : [];
    try {
      await mongoWpnSetExplorerExpanded(auth.sub, projectId, expanded_ids);
      return reply.send({ expanded_ids });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Project not found") {
        return reply.status(404).send({ error: msg });
      }
      return sendWpnError(reply, e);
    }
  });

  app.get("/wpn/workspaces/:workspaceId/settings", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { workspaceId } = request.params as { workspaceId: string };
    const wsCol = getWpnWorkspacesCollection();
    if (!(await wsCol.findOne({ id: workspaceId, userId: auth.sub }))) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    const settings = await mongoWpnGetWorkspaceSettings(auth.sub, workspaceId);
    return reply.send({ settings });
  });

  app.patch("/wpn/workspaces/:workspaceId/settings", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { workspaceId } = request.params as { workspaceId: string };
    const patch =
      request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    try {
      const settings = await mongoWpnPatchWorkspaceSettings(auth.sub, workspaceId, patch);
      return reply.send({ settings });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Workspace not found") {
        return reply.status(404).send({ error: msg });
      }
      return sendWpnError(reply, e);
    }
  });

  app.get("/wpn/projects/:projectId/settings", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const projCol = getWpnProjectsCollection();
    if (!(await projCol.findOne({ id: projectId, userId: auth.sub }))) {
      return reply.status(404).send({ error: "Project not found" });
    }
    const settings = await mongoWpnGetProjectSettings(auth.sub, projectId);
    return reply.send({ settings });
  });

  app.patch("/wpn/projects/:projectId/settings", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { projectId } = request.params as { projectId: string };
    const patch =
      request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? (request.body as Record<string, unknown>)
        : {};
    try {
      const settings = await mongoWpnPatchProjectSettings(auth.sub, projectId, patch);
      return reply.send({ settings });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Project not found") {
        return reply.status(404).send({ error: msg });
      }
      return sendWpnError(reply, e);
    }
  });
}
