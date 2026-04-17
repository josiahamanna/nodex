import type { FastifyReply, FastifyRequest } from "fastify";
import type { JwtPayload } from "./auth.js";
import { getOrgMembershipsCollection } from "./db.js";
import type { OrgMembershipDoc, OrgRole } from "./org-schemas.js";

export type OrgContext = {
  orgId: string;
  role: OrgRole;
};

export async function getOrgMembership(
  userIdHex: string,
  orgId: string,
): Promise<OrgMembershipDoc | null> {
  const memberships = getOrgMembershipsCollection();
  return memberships.findOne({ orgId, userId: userIdHex });
}

export async function listMembershipsForUser(
  userIdHex: string,
): Promise<OrgMembershipDoc[]> {
  const memberships = getOrgMembershipsCollection();
  return memberships.find({ userId: userIdHex }).toArray();
}

/**
 * Resolves and authorizes the caller against `orgId`. On failure, sends the
 * appropriate HTTP response and returns `null` — handlers must early-return.
 */
export async function requireOrgRole(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: JwtPayload,
  orgId: string,
  required: OrgRole,
): Promise<OrgContext | null> {
  const membership = await getOrgMembership(auth.sub, orgId);
  if (!membership) {
    await reply.status(404).send({ error: "Organization not found" });
    return null;
  }
  if (required === "admin" && membership.role !== "admin") {
    await reply.status(403).send({ error: "Admin role required" });
    return null;
  }
  return { orgId, role: membership.role };
}

/**
 * Like {@link requireOrgRole} but only checks membership exists (any role).
 */
export async function requireOrgMember(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: JwtPayload,
  orgId: string,
): Promise<OrgContext | null> {
  const membership = await getOrgMembership(auth.sub, orgId);
  if (!membership) {
    await reply.status(404).send({ error: "Organization not found" });
    return null;
  }
  return { orgId, role: membership.role };
}

/**
 * Resolve which org the request operates against. Priority:
 *   1. `X-Nodex-Org` header
 *   2. JWT `activeOrgId` claim
 *   3. caller's `defaultOrgId` (caller must look this up; not done here)
 * Returns `null` when no org can be determined; handlers may then prompt
 * the client or fall back to defaults.
 */
export function resolveActiveOrgId(
  request: FastifyRequest,
  auth: JwtPayload,
): string | null {
  const header = request.headers["x-nodex-org"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }
  if (typeof auth.activeOrgId === "string" && auth.activeOrgId.trim()) {
    return auth.activeOrgId.trim();
  }
  return null;
}
