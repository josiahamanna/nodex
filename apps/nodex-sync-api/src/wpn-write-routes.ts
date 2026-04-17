import type { FastifyInstance, FastifyReply } from "fastify";
import { ObjectId } from "mongodb";
import { requireAuth } from "./auth.js";
import {
  ensureDefaultSpaceForOrg,
  ensureUserHasDefaultOrg,
  getActiveDb,
  getOrgMembershipsCollection,
  getSpaceMembershipsCollection,
  getUsersCollection,
  getWorkspaceSharesCollection,
  getWpnNotesCollection,
  getWpnProjectsCollection,
  getWpnWorkspacesCollection,
  type UserDoc,
} from "./db.js";
import { recordAudit } from "./audit.js";
import { resolveActiveOrgId } from "./org-auth.js";
import {
  addWorkspaceShareBody,
  setWorkspaceVisibilityBody,
} from "./org-schemas.js";
import {
  assertCanReadWorkspace,
  assertCanWriteWorkspace,
  assertCanWriteWorkspaceForNote,
  assertCanWriteWorkspaceForProject,
} from "./permission-resolver.js";
import {
  getSpaceMembership,
  resolveActiveSpaceId,
} from "./space-auth.js";
import {
  vfsCanonicalPathsForTitleChange,
  rewriteMarkdownForWpnNoteTitleChange,
  normalizeVfsSegment,
} from "./wpn-vfs-rewrite.js";
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
  WpnDuplicateSiblingTitleError,
  WPN_DUPLICATE_NOTE_TITLE_MESSAGE,
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

/**
 * Resolve the (orgId, spaceId) scope for a write request:
 *   1. `X-Nodex-Space` + `X-Nodex-Org` headers
 *   2. JWT `activeSpaceId` / `activeOrgId` claims
 *   3. Caller's `defaultOrgId` and that org's default space
 *
 * Verifies the caller is a member of the resolved space; on failure returns
 * `{}` so the workspace insert proceeds without org/space stamping (legacy).
 */
async function resolveActiveScope(
  request: import("fastify").FastifyRequest,
  auth: import("./auth.js").JwtPayload,
): Promise<{ orgId?: string; spaceId?: string }> {
  const orgId = resolveActiveOrgId(request, auth);
  const headerSpaceId = resolveActiveSpaceId(request, auth);
  if (orgId && headerSpaceId) {
    const m = await getSpaceMembership(auth.sub, headerSpaceId);
    if (m) {
      return { orgId, spaceId: headerSpaceId };
    }
    return {};
  }
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    let userObjectId: ObjectId | null = null;
    try {
      userObjectId = new ObjectId(auth.sub);
    } catch {
      return {};
    }
    const user = (await getUsersCollection().findOne({
      _id: userObjectId,
    })) as UserDoc | null;
    if (!user) {
      return {};
    }
    if (user.defaultOrgId) {
      resolvedOrgId = user.defaultOrgId;
    } else {
      const ensured = await ensureUserHasDefaultOrg(
        getActiveDb(),
        auth.sub,
        user.email,
      );
      resolvedOrgId = ensured.orgId;
    }
  }
  if (!resolvedOrgId) {
    return {};
  }
  const ensuredSpace = await ensureDefaultSpaceForOrg(
    getActiveDb(),
    resolvedOrgId,
    auth.sub,
  ).catch(() => null);
  if (!ensuredSpace) {
    return { orgId: resolvedOrgId };
  }
  return { orgId: resolvedOrgId, spaceId: ensuredSpace.spaceId };
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
      const scope = await resolveActiveScope(request, auth);
      const workspace = await mongoWpnCreateWorkspace(auth.sub, name, scope);
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
    const ws = await assertCanWriteWorkspace(reply, auth, id);
    if (!ws) {
      return;
    }
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
    const workspace = await mongoWpnUpdateWorkspace(ws.userId, id, patch);
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
    const ws = await assertCanWriteWorkspace(reply, auth, id);
    if (!ws) {
      return;
    }
    const ok = await mongoWpnDeleteWorkspace(ws.userId, id);
    if (!ok) {
      return reply.status(404).send({ error: "Workspace not found" });
    }
    await getWorkspaceSharesCollection().deleteMany({ workspaceId: id });
    return reply.send({ ok: true as const });
  });

  /** Phase 4 — set workspace visibility. Owner-equivalent rights required. */
  app.patch("/wpn/workspaces/:id/visibility", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const ws = await assertCanWriteWorkspace(reply, auth, id);
    if (!ws) {
      return;
    }
    const parsed = setWorkspaceVisibilityBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    await getWpnWorkspacesCollection().updateOne(
      { id },
      {
        $set: {
          visibility: parsed.data.visibility,
          updated_at_ms: Date.now(),
          ...(ws.creatorUserId ? {} : { creatorUserId: ws.userId }),
        },
      },
    );
    if (parsed.data.visibility !== "shared") {
      await getWorkspaceSharesCollection().deleteMany({ workspaceId: id });
    }
    if (ws.orgId) {
      await recordAudit({
        orgId: ws.orgId,
        actorUserId: auth.sub,
        action: "workspace.visibility.set",
        targetType: "workspace",
        targetId: id,
        metadata: {
          from: ws.visibility ?? "public",
          to: parsed.data.visibility,
        },
      });
    }
    return reply.send({ id, visibility: parsed.data.visibility });
  });

  /** Phase 4 — list shares on a workspace. Reader access required. */
  app.get("/wpn/workspaces/:id/shares", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const ws = await assertCanReadWorkspace(reply, auth, id);
    if (!ws) {
      return;
    }
    const shares = await getWorkspaceSharesCollection()
      .find({ workspaceId: id })
      .toArray();
    const userIds = shares
      .map((s) => s.userId)
      .filter((s) => /^[a-f0-9]{24}$/i.test(s));
    const users = (await getUsersCollection()
      .find({ _id: { $in: userIds.map((u) => new ObjectId(u)) } })
      .toArray()) as UserDoc[];
    const usersById = new Map(users.map((u) => [u._id.toHexString(), u]));
    return reply.send({
      shares: shares.map((s) => {
        const u = usersById.get(s.userId);
        return {
          userId: s.userId,
          email: u?.email ?? "(unknown)",
          displayName: u?.displayName ?? null,
          addedAt: s.addedAt,
        };
      }),
    });
  });

  /** Phase 4 — grant a user explicit read on a `shared` workspace. Target must
      be a member of the workspace's space. */
  app.post("/wpn/workspaces/:id/shares", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const ws = await assertCanWriteWorkspace(reply, auth, id);
    if (!ws) {
      return;
    }
    const parsed = addWorkspaceShareBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    if (!ws.spaceId) {
      return reply
        .status(400)
        .send({ error: "Workspace is legacy single-tenant; assign to a space first" });
    }
    const orgMember = ws.orgId
      ? await getOrgMembershipsCollection().findOne({
          orgId: ws.orgId,
          userId: parsed.data.userId,
        })
      : null;
    const spaceMember = await getSpaceMembershipsCollection().findOne({
      spaceId: ws.spaceId,
      userId: parsed.data.userId,
    });
    if (!orgMember || !spaceMember) {
      return reply
        .status(400)
        .send({ error: "Target user must be a member of the workspace's space" });
    }
    await getWorkspaceSharesCollection().updateOne(
      { workspaceId: id, userId: parsed.data.userId },
      {
        $setOnInsert: {
          workspaceId: id,
          userId: parsed.data.userId,
          addedByUserId: auth.sub,
          addedAt: new Date(),
        },
      },
      { upsert: true },
    );
    return reply.status(204).send();
  });

  /** Phase 4 — revoke an explicit share. */
  app.delete(
    "/wpn/workspaces/:id/shares/:userId",
    async (request, reply) => {
      const auth = await requireAuth(request, reply, jwtSecret);
      if (!auth) {
        return;
      }
      const { id, userId } = request.params as {
        id: string;
        userId: string;
      };
      const ws = await assertCanWriteWorkspace(reply, auth, id);
      if (!ws) {
        return;
      }
      const result = await getWorkspaceSharesCollection().deleteOne({
        workspaceId: id,
        userId,
      });
      if (result.deletedCount === 0) {
        return reply.status(404).send({ error: "Share not found" });
      }
      return reply.status(204).send();
    },
  );

  app.post("/wpn/workspaces/:workspaceId/projects", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await assertCanWriteWorkspace(reply, auth, workspaceId);
    if (!ws) {
      return;
    }
    const name =
      typeof (request.body as { name?: unknown })?.name === "string"
        ? (request.body as { name: string }).name
        : "Project";
    const project = await mongoWpnCreateProject(ws.userId, workspaceId, name);
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
    const ws = await assertCanWriteWorkspaceForProject(reply, auth, id);
    if (!ws) {
      return;
    }
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
    const project = await mongoWpnUpdateProject(ws.userId, id, patch);
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
    const ws = await assertCanWriteWorkspaceForProject(reply, auth, id);
    if (!ws) {
      return;
    }
    const ok = await mongoWpnDeleteProject(ws.userId, id);
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
    const ws = await assertCanWriteWorkspaceForProject(reply, auth, projectId);
    if (!ws) {
      return;
    }
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
      const created = await mongoWpnCreateNote(ws.userId, projectId, {
        anchorId: rel === "root" ? undefined : anchorId,
        relation: rel,
        type,
        content: typeof body.content === "string" ? body.content : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        metadata:
          body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined,
      }, { editorUserId: auth.sub });
      return reply.status(201).send(created);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "Project not found") {
        return reply.status(404).send({ error: msg });
      }
      return sendWpnError(reply, e, 400);
    }
  });

  /** Scan all notes for VFS links that reference the renamed note and return affected note IDs. */
  async function vfsPreviewTitleChange(
    userId: string,
    noteId: string,
    newTitle: string,
  ): Promise<{ dependentNoteCount: number; dependentNoteIds: string[] }> {
    const noteCol = getWpnNotesCollection();
    const projCol = getWpnProjectsCollection();
    const wsCol = getWpnWorkspacesCollection();
    const note = await noteCol.findOne({ id: noteId, userId, deleted: { $ne: true } });
    if (!note) return { dependentNoteCount: 0, dependentNoteIds: [] };
    const proj = await projCol.findOne({ id: note.project_id, userId });
    if (!proj) return { dependentNoteCount: 0, dependentNoteIds: [] };
    const ws = await wsCol.findOne({ id: proj.workspace_id, userId });
    if (!ws) return { dependentNoteCount: 0, dependentNoteIds: [] };

    const nextTitle = newTitle.trim() || note.title;
    const ctx = { workspace_name: ws.name, project_name: proj.name };
    const paths = await vfsCanonicalPathsForTitleChange(ctx, note.title, nextTitle);
    if (!paths) return { dependentNoteCount: 0, dependentNoteIds: [] };

    const { oldCanonical, newCanonical } = paths;
    const oldSeg = await normalizeVfsSegment(note.title, "Untitled");
    const newSeg = await normalizeVfsSegment(nextTitle, "Untitled");
    const allNotes = await noteCol.find({ userId, deleted: { $ne: true } }).toArray();
    const dependentNoteIds: string[] = [];
    for (const n of allNotes) {
      const c0 = n.content ?? "";
      const c1 = await rewriteMarkdownForWpnNoteTitleChange(
        c0, n.project_id, note.project_id,
        oldCanonical, newCanonical, oldSeg, newSeg,
      );
      if (c1 !== c0) dependentNoteIds.push(n.id);
    }
    return { dependentNoteCount: dependentNoteIds.length, dependentNoteIds };
  }

  /** Apply VFS link rewrites across all notes after a title change. */
  async function vfsApplyTitleChange(
    userId: string,
    noteId: string,
    oldTitle: string,
    newTitle: string,
    renamedProjectId: string,
    workspaceName: string,
    projectName: string,
  ): Promise<number> {
    const ctx = { workspace_name: workspaceName, project_name: projectName };
    const paths = await vfsCanonicalPathsForTitleChange(ctx, oldTitle, newTitle);
    if (!paths) return 0;
    const { oldCanonical, newCanonical } = paths;
    const oldSeg = await normalizeVfsSegment(oldTitle, "Untitled");
    const newSeg = await normalizeVfsSegment(newTitle, "Untitled");
    const noteCol = getWpnNotesCollection();
    const allNotes = await noteCol.find({ userId, deleted: { $ne: true } }).toArray();
    let updatedCount = 0;
    const now = Date.now();
    for (const n of allNotes) {
      const c0 = n.content ?? "";
      const c1 = await rewriteMarkdownForWpnNoteTitleChange(
        c0, n.project_id, renamedProjectId,
        oldCanonical, newCanonical, oldSeg, newSeg,
      );
      if (c1 !== c0) {
        await noteCol.updateOne(
          { id: n.id, userId },
          { $set: { content: c1, updated_at_ms: now } },
        );
        updatedCount++;
      }
    }
    return updatedCount;
  }

  app.post("/wpn/notes/:id/preview-title-change", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as Record<string, unknown>;
    const newTitle = typeof body.title === "string" ? body.title : "";
    const result = await vfsPreviewTitleChange(auth.sub, id, newTitle);
    return reply.send(result);
  });

  app.patch("/wpn/notes/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { id } = request.params as { id: string };
    const ws = await assertCanWriteWorkspaceForNote(reply, auth, id);
    if (!ws) {
      return;
    }
    const ownerId = ws.userId;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const updateVfsDependentLinks = body.updateVfsDependentLinks !== false;
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
    try {
      // Capture old title + context before update (needed for VFS rewrite)
      let oldTitle: string | null = null;
      let renamedProjectId: string | null = null;
      let workspaceName: string | null = null;
      let projectName: string | null = null;
      if (updateVfsDependentLinks && patch.title !== undefined) {
        const noteCol = getWpnNotesCollection();
        const before = await noteCol.findOne({ id, userId: ownerId, deleted: { $ne: true } });
        if (before) {
          oldTitle = before.title;
          renamedProjectId = before.project_id;
          const projCol = getWpnProjectsCollection();
          const proj = await projCol.findOne({ id: before.project_id, userId: ownerId });
          if (proj) {
            projectName = proj.name;
            const wsCol = getWpnWorkspacesCollection();
            const wsRow = await wsCol.findOne({ id: proj.workspace_id, userId: ownerId });
            if (wsRow) workspaceName = wsRow.name;
          }
        }
      }

      const note = await mongoWpnUpdateNote(ownerId, id, patch, { editorUserId: auth.sub });
      if (!note) {
        return reply.status(404).send({ error: "Note not found" });
      }

      // Apply VFS link rewrites if title changed
      if (
        updateVfsDependentLinks &&
        oldTitle !== null &&
        renamedProjectId &&
        workspaceName &&
        projectName &&
        oldTitle !== note.title
      ) {
        try {
          await vfsApplyTitleChange(
            ownerId, id, oldTitle, note.title,
            renamedProjectId, workspaceName, projectName,
          );
        } catch (err) {
          console.error("[PATCH /wpn/notes/:id] VFS rewrite failed:", err);
        }
      }

      return reply.send({ note });
    } catch (e) {
      if (e instanceof WpnDuplicateSiblingTitleError) {
        return reply.status(409).send({ error: WPN_DUPLICATE_NOTE_TITLE_MESSAGE });
      }
      throw e;
    }
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
    if (ids.length === 0) {
      return reply.send({ ok: true as const, deleted: 0 });
    }
    // Phase 4 — verify caller can write to every requested note's workspace.
    const notes = await getWpnNotesCollection().find({ id: { $in: ids } }).toArray();
    if (notes.length === 0) {
      return reply.send({ ok: true as const, deleted: 0 });
    }
    const ownerByIdMap = new Map<string, string>();
    const projectIds = [...new Set(notes.map((n) => n.project_id))];
    for (const projectId of projectIds) {
      const ws = await assertCanWriteWorkspaceForProject(reply, auth, projectId);
      if (!ws) {
        return;
      }
      for (const n of notes) {
        if (n.project_id === projectId) {
          ownerByIdMap.set(n.id, ws.userId);
        }
      }
    }
    // Group ids by owner so the legacy delete helper sees its own data.
    const byOwner = new Map<string, string[]>();
    for (const noteId of ids) {
      const ownerId = ownerByIdMap.get(noteId);
      if (!ownerId) continue;
      const arr = byOwner.get(ownerId) ?? [];
      arr.push(noteId);
      byOwner.set(ownerId, arr);
    }
    for (const [ownerId, group] of byOwner) {
      await mongoWpnDeleteNotes(ownerId, group);
    }
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
    const ws = await assertCanWriteWorkspaceForProject(reply, auth, projectId);
    if (!ws) {
      return;
    }
    try {
      await mongoWpnMoveNote(
        ws.userId,
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
      const ws = await assertCanWriteWorkspaceForProject(reply, auth, projectId);
      if (!ws) {
        return;
      }
      try {
        const result = await mongoWpnDuplicateSubtree(ws.userId, projectId, noteId);
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
