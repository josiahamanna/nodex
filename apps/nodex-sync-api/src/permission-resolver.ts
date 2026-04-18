import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtPayload } from "./auth.js";
import {
  getOrgMembershipsCollection,
  getSpaceMembershipsCollection,
  getTeamMembershipsCollection,
  getTeamSpaceGrantsCollection,
  getWorkspaceSharesCollection,
  getWpnNotesCollection,
  getWpnProjectsCollection,
  getWpnWorkspacesCollection,
  type WpnWorkspaceDoc,
} from "./db.js";
import type { SpaceRole } from "./org-schemas.js";

/**
 * Effective per-space role for a user in a single map. Combines:
 *   1. Direct rows in `space_memberships`.
 *   2. Team-mediated rows: every team the user belongs to, every space those
 *      teams have grants on.
 *
 * When two sources both grant access to the same space, **owner wins** over
 * member. This is the single source of truth — every space-scoped check
 * (read, write, member listing) resolves through here.
 */
export async function getEffectiveSpaceRoles(
  userIdHex: string,
): Promise<Map<string, SpaceRole>> {
  const out = new Map<string, SpaceRole>();
  const direct = await getSpaceMembershipsCollection()
    .find({ userId: userIdHex })
    .toArray();
  for (const m of direct) {
    upgradeRole(out, m.spaceId, m.role);
  }
  const teams = await getTeamMembershipsCollection()
    .find({ userId: userIdHex })
    .toArray();
  if (teams.length === 0) {
    return out;
  }
  const grants = await getTeamSpaceGrantsCollection()
    .find({ teamId: { $in: teams.map((t) => t.teamId) } })
    .toArray();
  for (const g of grants) {
    upgradeRole(out, g.spaceId, g.role);
  }
  return out;
}

/** Convenience: just check whether a user has any access to a space. */
export async function userCanReadSpace(
  userIdHex: string,
  spaceIdHex: string,
): Promise<boolean> {
  const roles = await getEffectiveSpaceRoles(userIdHex);
  return roles.has(spaceIdHex);
}

/** Convenience: returns the effective role or null. */
export async function effectiveRoleInSpace(
  userIdHex: string,
  spaceIdHex: string,
): Promise<SpaceRole | null> {
  const roles = await getEffectiveSpaceRoles(userIdHex);
  return roles.get(spaceIdHex) ?? null;
}

/** Priority when combining role sources: higher wins. */
const ROLE_RANK: Record<SpaceRole, number> = { owner: 3, member: 2, viewer: 1 };

function upgradeRole(
  out: Map<string, SpaceRole>,
  spaceId: string,
  next: SpaceRole,
): void {
  const cur = out.get(spaceId);
  if (cur === undefined || ROLE_RANK[next] > ROLE_RANK[cur]) {
    out.set(spaceId, next);
  }
}

/**
 * Phase 4 — assert the caller can READ the given workspace, considering:
 *   1. Legacy single-tenant workspaces (no spaceId) still readable only by `userId`.
 *   2. Visibility = public → any space member (direct or team grant).
 *   3. Visibility = private → creator only.
 *   4. Visibility = shared → creator ∪ workspace_shares list (must also be space member).
 *
 * Sends 404 (never 403, to avoid leaking workspace existence) and returns
 * `null` on failure — handlers must early-return.
 */
export async function assertCanReadWorkspace(
  reply: FastifyReply,
  auth: JwtPayload,
  workspaceId: string,
): Promise<WpnWorkspaceDoc | null> {
  const ws = await getWpnWorkspacesCollection().findOne({ id: workspaceId });
  if (!ws) {
    await reply.status(404).send({ error: "Workspace not found" });
    return null;
  }
  // Legacy single-tenant workspaces are owner-only.
  if (!ws.spaceId) {
    if (ws.userId !== auth.sub) {
      await reply.status(404).send({ error: "Workspace not found" });
      return null;
    }
    return ws;
  }
  // Org admin of the workspace's org can always read, even without direct space membership.
  if (ws.orgId) {
    const orgMembership = await getOrgMembershipsCollection().findOne({
      orgId: ws.orgId,
      userId: auth.sub,
    });
    if (orgMembership?.role === "admin") {
      return ws;
    }
  }
  const roles = await getEffectiveSpaceRoles(auth.sub);
  const spaceRole = roles.get(ws.spaceId);
  if (!spaceRole) {
    await reply.status(404).send({ error: "Workspace not found" });
    return null;
  }
  const visibility = ws.visibility ?? "public";
  const creator = ws.creatorUserId ?? ws.userId;
  if (visibility === "public") {
    return ws;
  }
  if (visibility === "private") {
    if (creator === auth.sub || spaceRole === "owner") {
      return ws;
    }
    await reply.status(404).send({ error: "Workspace not found" });
    return null;
  }
  // shared
  if (creator === auth.sub || spaceRole === "owner") {
    return ws;
  }
  const share = await getWorkspaceSharesCollection().findOne({
    workspaceId,
    userId: auth.sub,
  });
  if (share) {
    return ws;
  }
  await reply.status(404).send({ error: "Workspace not found" });
  return null;
}

/**
 * Phase 4 — assert the caller can WRITE to the given workspace.
 * Order of checks:
 *   1. Org admin of the workspace's org — always writes (admin override).
 *   2. Space `viewer` — never writes, even if they created the workspace.
 *   3. Space `owner` — always writes.
 *   4. Workspace creator — writes their own.
 * Legacy `userId`-owned workspaces (no `spaceId`): only the legacy owner.
 * Sends 403 on visibility-failure (after a successful read permission),
 * 404 when the workspace is invisible.
 */
export async function assertCanWriteWorkspace(
  reply: FastifyReply,
  auth: JwtPayload,
  workspaceId: string,
): Promise<WpnWorkspaceDoc | null> {
  const ws = await assertCanReadWorkspace(reply, auth, workspaceId);
  if (!ws) {
    return null;
  }
  if (!ws.spaceId) {
    return ws;
  }
  if (ws.orgId) {
    const orgMembership = await getOrgMembershipsCollection().findOne({
      orgId: ws.orgId,
      userId: auth.sub,
    });
    if (orgMembership?.role === "admin") {
      return ws;
    }
  }
  const roles = await getEffectiveSpaceRoles(auth.sub);
  const role = roles.get(ws.spaceId);
  if (role === "viewer") {
    await reply.status(403).send({ error: "Workspace is read-only for this user" });
    return null;
  }
  if (role === "owner") {
    return ws;
  }
  const creator = ws.creatorUserId ?? ws.userId;
  if (creator === auth.sub) {
    return ws;
  }
  await reply.status(403).send({ error: "Workspace is read-only for this user" });
  return null;
}

/** Read access derived from a project ID (looks up parent workspace). */
export async function assertCanReadWorkspaceForProject(
  reply: FastifyReply,
  auth: JwtPayload,
  projectId: string,
): Promise<WpnWorkspaceDoc | null> {
  const project = await getWpnProjectsCollection().findOne({ id: projectId });
  if (!project) {
    await reply.status(404).send({ error: "Project not found" });
    return null;
  }
  return assertCanReadWorkspace(reply, auth, project.workspace_id);
}

/** Write access derived from a project ID. */
export async function assertCanWriteWorkspaceForProject(
  reply: FastifyReply,
  auth: JwtPayload,
  projectId: string,
): Promise<WpnWorkspaceDoc | null> {
  const project = await getWpnProjectsCollection().findOne({ id: projectId });
  if (!project) {
    await reply.status(404).send({ error: "Project not found" });
    return null;
  }
  return assertCanWriteWorkspace(reply, auth, project.workspace_id);
}

/** Read access derived from a note ID (looks up project then workspace). */
export async function assertCanReadWorkspaceForNote(
  reply: FastifyReply,
  auth: JwtPayload,
  noteId: string,
): Promise<WpnWorkspaceDoc | null> {
  const note = await getWpnNotesCollection().findOne({ id: noteId });
  if (!note) {
    await reply.status(404).send({ error: "Note not found" });
    return null;
  }
  return assertCanReadWorkspaceForProject(reply, auth, note.project_id);
}

/** Write access derived from a note ID. */
export async function assertCanWriteWorkspaceForNote(
  reply: FastifyReply,
  auth: JwtPayload,
  noteId: string,
): Promise<WpnWorkspaceDoc | null> {
  const note = await getWpnNotesCollection().findOne({ id: noteId });
  if (!note) {
    await reply.status(404).send({ error: "Note not found" });
    return null;
  }
  return assertCanWriteWorkspaceForProject(reply, auth, note.project_id);
}

// Suppress unused-import warning for FastifyRequest (kept for future request-scoped cache).
export type _FR = FastifyRequest;
