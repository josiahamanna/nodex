import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { requireAuth, signAccessToken, signRefreshToken } from "./auth.js";
import {
  ensureUserHasDefaultOrg,
  getActiveDb,
  getOrgInvitesCollection,
  getOrgMembershipsCollection,
  getOrgsCollection,
  getUsersCollection,
  type UserDoc,
} from "./db.js";
import {
  acceptInviteBody,
  createInviteBody,
  createOrgBody,
  createOrgMemberBody,
  resetMemberPasswordBody,
  setActiveOrgBody,
  setMemberRoleBody,
  type OrgRole,
} from "./org-schemas.js";
import { listMembershipsForUser, requireOrgRole } from "./org-auth.js";
import { recordAudit } from "./audit.js";
import { buildSessionsAfterAppend } from "./refresh-sessions.js";

const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newInviteToken(): { plain: string; hash: string } {
  const plain = randomBytes(32).toString("base64url");
  return { plain, hash: hashInviteToken(plain) };
}

function isValidOrgIdHex(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

export function registerOrgRoutes(
  app: FastifyInstance,
  opts: { jwtSecret: string },
): void {
  const { jwtSecret } = opts;

  /** List orgs the caller belongs to plus role + active selection. */
  app.get("/orgs/me", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const memberships = await listMembershipsForUser(auth.sub);
    if (memberships.length === 0) {
      const users = getUsersCollection();
      const u = (await users.findOne({
        _id: new ObjectId(auth.sub),
      })) as UserDoc | null;
      if (u) {
        await ensureUserHasDefaultOrg(getActiveDb(), auth.sub, u.email);
      }
    }
    const refreshed = await listMembershipsForUser(auth.sub);
    const orgIds = refreshed.map((m) => m.orgId).filter(isValidOrgIdHex);
    const orgs =
      orgIds.length === 0
        ? []
        : await getOrgsCollection()
            .find({ _id: { $in: orgIds.map((id) => new ObjectId(id)) } })
            .toArray();
    const orgsById = new Map(orgs.map((o) => [o._id.toHexString(), o]));
    const userDoc = (await getUsersCollection().findOne({
      _id: new ObjectId(auth.sub),
    })) as UserDoc | null;
    const activeOrgId = auth.activeOrgId ?? userDoc?.defaultOrgId ?? null;
    return reply.send({
      orgs: refreshed.map((m) => {
        const o = orgsById.get(m.orgId);
        return {
          orgId: m.orgId,
          name: o?.name ?? "(unknown org)",
          slug: o?.slug ?? "",
          role: m.role,
          isDefault: userDoc?.defaultOrgId === m.orgId,
        };
      }),
      activeOrgId,
      defaultOrgId: userDoc?.defaultOrgId ?? null,
    });
  });

  /** Create a new Org. Caller becomes admin and owner. */
  app.post("/orgs", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const parsed = createOrgBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const orgs = getOrgsCollection();
    const memberships = getOrgMembershipsCollection();
    const slugFromName = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 56);
    const slug =
      parsed.data.slug ?? (slugFromName.length >= 2 ? slugFromName : `org-${randomUUID().slice(0, 8)}`);
    const slugTaken = await orgs.findOne({ slug });
    if (slugTaken) {
      return reply.status(409).send({ error: "Slug already in use" });
    }
    const ins = await orgs.insertOne({
      name: parsed.data.name,
      slug,
      ownerUserId: auth.sub,
      createdAt: new Date(),
    } as never);
    const orgIdHex = ins.insertedId.toHexString();
    await memberships.insertOne({
      orgId: orgIdHex,
      userId: auth.sub,
      role: "admin" as OrgRole,
      joinedAt: new Date(),
    } as never);
    return reply.send({ orgId: orgIdHex, name: parsed.data.name, slug });
  });

  /** Switch the access-token's `activeOrgId` claim. Re-issues access token. */
  app.post("/orgs/active", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const parsed = setActiveOrgBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const ctx = await requireOrgRole(
      request,
      reply,
      auth,
      parsed.data.orgId,
      "member",
    );
    if (!ctx) {
      return;
    }
    const token = signAccessToken(jwtSecret, {
      sub: auth.sub,
      email: auth.email,
      activeOrgId: parsed.data.orgId,
    });
    return reply.send({ token, activeOrgId: parsed.data.orgId });
  });

  /** Admin-only: list pending + accepted invites for an Org. */
  app.get("/orgs/:orgId/invites", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId } = request.params as { orgId: string };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const list = await getOrgInvitesCollection()
      .find({ orgId })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    return reply.send({
      invites: list.map((i) => ({
        inviteId: i._id.toHexString(),
        email: i.email,
        role: i.role,
        status: i.status,
        invitedByUserId: i.invitedByUserId,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        acceptedAt: i.acceptedAt ?? null,
      })),
    });
  });

  /** Admin-only: create an invite. Returns the plain token (copy-link v1). */
  app.post("/orgs/:orgId/invites", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId } = request.params as { orgId: string };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const parsed = createInviteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const invites = getOrgInvitesCollection();
    const existingPending = await invites.findOne({
      orgId,
      email,
      status: "pending",
    });
    if (existingPending) {
      return reply.status(409).send({ error: "Invite already pending for this email" });
    }
    const { plain, hash } = newInviteToken();
    const now = new Date();
    const ins = await invites.insertOne({
      orgId,
      email,
      role: parsed.data.role,
      tokenHash: hash,
      status: "pending",
      invitedByUserId: auth.sub,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    } as never);
    await recordAudit({
      orgId,
      actorUserId: auth.sub,
      action: "org.invite.create",
      targetType: "org_invite",
      targetId: ins.insertedId.toHexString(),
      metadata: { email, role: parsed.data.role },
    });
    return reply.send({
      inviteId: ins.insertedId.toHexString(),
      email,
      role: parsed.data.role,
      token: plain,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    });
  });

  /** Admin-only: revoke an invite. */
  app.delete("/orgs/:orgId/invites/:inviteId", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId, inviteId } = request.params as {
      orgId: string;
      inviteId: string;
    };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    let oid: ObjectId;
    try {
      oid = new ObjectId(inviteId);
    } catch {
      return reply.status(400).send({ error: "Invalid invite id" });
    }
    const result = await getOrgInvitesCollection().updateOne(
      { _id: oid, orgId, status: "pending" },
      { $set: { status: "revoked" } },
    );
    if (result.matchedCount === 0) {
      return reply.status(404).send({ error: "Invite not found or already settled" });
    }
    await recordAudit({
      orgId,
      actorUserId: auth.sub,
      action: "org.invite.revoke",
      targetType: "org_invite",
      targetId: inviteId,
    });
    return reply.status(204).send();
  });

  /**
   * Public (no auth required): accept an invite token. If the user already
   * exists, simply add membership. Otherwise create the account and require
   * a password in the body. Returns access + refresh tokens.
   */
  app.post("/auth/accept-invite", async (request, reply) => {
    const parsed = acceptInviteBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const tokenHash = hashInviteToken(parsed.data.token);
    const invites = getOrgInvitesCollection();
    const invite = await invites.findOne({ tokenHash, status: "pending" });
    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      return reply.status(404).send({ error: "Invite not found or expired" });
    }
    const users = getUsersCollection();
    const email = invite.email.toLowerCase();
    let user = (await users.findOne({ email })) as UserDoc | null;
    let createdUser = false;
    if (!user) {
      if (!parsed.data.password) {
        return reply.status(400).send({
          error: "Password required for new account",
          needsPassword: true,
        });
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const ins = await users.insertOne({
        email,
        passwordHash,
        displayName: parsed.data.displayName ?? null,
        mustSetPassword: false,
      } as Omit<UserDoc, "_id">);
      user = (await users.findOne({ _id: ins.insertedId })) as UserDoc;
      createdUser = true;
    } else if (user.mustSetPassword === true) {
      if (!parsed.data.password) {
        return reply.status(400).send({
          error: "Password required to finish account setup",
          needsPassword: true,
        });
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordHash,
            mustSetPassword: false,
            ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
          },
        },
      );
      user = (await users.findOne({ _id: user._id })) as UserDoc;
    }
    const userIdHex = user._id.toHexString();
    const memberships = getOrgMembershipsCollection();
    await memberships.updateOne(
      { orgId: invite.orgId, userId: userIdHex },
      {
        $setOnInsert: {
          orgId: invite.orgId,
          userId: userIdHex,
          role: invite.role,
          joinedAt: new Date(),
        },
      },
      { upsert: true },
    );
    await invites.updateOne(
      { _id: invite._id },
      {
        $set: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedByUserId: userIdHex,
        },
      },
    );
    await recordAudit({
      orgId: invite.orgId,
      actorUserId: userIdHex,
      action: "org.invite.accept",
      targetType: "org_invite",
      targetId: invite._id.toHexString(),
      metadata: { email, role: invite.role },
    });
    if (createdUser || !user.defaultOrgId) {
      await users.updateOne(
        { _id: user._id, $or: [{ defaultOrgId: { $exists: false } }, { defaultOrgId: null }] },
        { $set: { defaultOrgId: invite.orgId } },
      );
    }
    const payload = { sub: userIdHex, email, activeOrgId: invite.orgId };
    const jti = randomUUID();
    const token = signAccessToken(jwtSecret, payload);
    const refreshToken = signRefreshToken(
      jwtSecret,
      { sub: userIdHex, email },
      jti,
    );
    const nextSessions = buildSessionsAfterAppend(user, jti);
    await users.updateOne(
      { _id: user._id },
      { $set: { refreshSessions: nextSessions }, $unset: { activeRefreshJti: "" } },
    );
    return reply.send({
      token,
      refreshToken,
      userId: userIdHex,
      orgId: invite.orgId,
      role: invite.role,
      createdUser,
    });
  });

  /** Admin-only: list members of an Org. */
  app.get("/orgs/:orgId/members", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId } = request.params as { orgId: string };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const memberships = await getOrgMembershipsCollection()
      .find({ orgId })
      .toArray();
    const userIds = memberships
      .map((m) => m.userId)
      .filter(isValidOrgIdHex);
    const users = getUsersCollection();
    const userDocs = (await users
      .find({ _id: { $in: userIds.map((id) => new ObjectId(id)) } })
      .toArray()) as UserDoc[];
    const usersById = new Map(userDocs.map((u) => [u._id.toHexString(), u]));
    return reply.send({
      members: memberships.map((m) => {
        const u = usersById.get(m.userId);
        return {
          userId: m.userId,
          email: u?.email ?? "(unknown)",
          displayName: u?.displayName ?? null,
          role: m.role,
          mustSetPassword: u?.mustSetPassword === true,
          joinedAt: m.joinedAt,
        };
      }),
    });
  });

  /** Admin-only: change a member's role. Last admin cannot demote themselves. */
  app.patch("/orgs/:orgId/members/:userId/role", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId, userId } = request.params as {
      orgId: string;
      userId: string;
    };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const parsed = setMemberRoleBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const memberships = getOrgMembershipsCollection();
    const target = await memberships.findOne({ orgId, userId });
    if (!target) {
      return reply.status(404).send({ error: "Member not found" });
    }
    if (
      target.role === "admin" &&
      parsed.data.role === "member" &&
      target.userId === auth.sub
    ) {
      const adminCount = await memberships.countDocuments({ orgId, role: "admin" });
      if (adminCount <= 1) {
        return reply
          .status(400)
          .send({ error: "Cannot demote the last admin of the org" });
      }
    }
    await memberships.updateOne(
      { _id: target._id },
      { $set: { role: parsed.data.role } },
    );
    await recordAudit({
      orgId,
      actorUserId: auth.sub,
      action: "org.member.role_change",
      targetType: "org_membership",
      targetId: userId,
      metadata: { from: target.role, to: parsed.data.role },
    });
    return reply.status(204).send();
  });

  /** Admin-only: remove a member from the org. */
  app.delete("/orgs/:orgId/members/:userId", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId, userId } = request.params as {
      orgId: string;
      userId: string;
    };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const memberships = getOrgMembershipsCollection();
    const target = await memberships.findOne({ orgId, userId });
    if (!target) {
      return reply.status(404).send({ error: "Member not found" });
    }
    if (target.role === "admin") {
      const adminCount = await memberships.countDocuments({ orgId, role: "admin" });
      if (adminCount <= 1) {
        return reply
          .status(400)
          .send({ error: "Cannot remove the last admin of the org" });
      }
    }
    await memberships.deleteOne({ _id: target._id });
    await recordAudit({
      orgId,
      actorUserId: auth.sub,
      action: "org.member.remove",
      targetType: "org_membership",
      targetId: userId,
      metadata: { role: target.role },
    });
    return reply.status(204).send();
  });

  /**
   * Admin-only: create a new user + org membership in one call. The admin
   * supplies a temporary password and shares it out-of-band; the new user is
   * forced to change it on first login (mustSetPassword=true).
   */
  app.post("/orgs/:orgId/members/create", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId } = request.params as { orgId: string };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const parsed = createOrgMemberBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const email = parsed.data.email.toLowerCase();
    const users = getUsersCollection();
    const existing = await users.findOne({ email });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const ins = await users.insertOne({
      email,
      passwordHash,
      mustSetPassword: true,
    } as Omit<UserDoc, "_id">);
    const userIdHex = ins.insertedId.toHexString();
    await getOrgMembershipsCollection().insertOne({
      orgId,
      userId: userIdHex,
      role: parsed.data.role,
      joinedAt: new Date(),
    } as never);
    await recordAudit({
      orgId,
      actorUserId: auth.sub,
      action: "org.member.create_with_password",
      targetType: "org_membership",
      targetId: userIdHex,
      metadata: { email, role: parsed.data.role },
    });
    return reply.send({
      userId: userIdHex,
      email,
      role: parsed.data.role,
      mustSetPassword: true,
    });
  });

  /**
   * Admin-only: reset a member's password. Sets mustSetPassword=true so the
   * user must pick a new one on next login. Caller must share the given org
   * with the target (enforced by requireOrgRole + membership check below).
   */
  app.post("/orgs/:orgId/members/:userId/reset-password", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const { orgId, userId } = request.params as {
      orgId: string;
      userId: string;
    };
    const ctx = await requireOrgRole(request, reply, auth, orgId, "admin");
    if (!ctx) {
      return;
    }
    const parsed = resetMemberPasswordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const membership = await getOrgMembershipsCollection().findOne({
      orgId,
      userId,
    });
    if (!membership) {
      return reply.status(404).send({ error: "Member not found in this org" });
    }
    let uoid: ObjectId;
    try {
      uoid = new ObjectId(userId);
    } catch {
      return reply.status(400).send({ error: "Invalid user id" });
    }
    const users = getUsersCollection();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const result = await users.updateOne(
      { _id: uoid },
      {
        $set: { passwordHash, mustSetPassword: true },
        $unset: { refreshSessions: "", activeRefreshJti: "" },
      },
    );
    if (result.matchedCount === 0) {
      return reply.status(404).send({ error: "User not found" });
    }
    await recordAudit({
      orgId,
      actorUserId: auth.sub,
      action: "org.member.password_reset",
      targetType: "org_membership",
      targetId: userId,
    });
    return reply.send({ userId, mustSetPassword: true });
  });

  /** Validate an invite token without consuming it (for Accept screen prefill). */
  app.get("/auth/invites/preview", async (request, reply) => {
    const q = z
      .object({ token: z.string().min(10) })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(400).send({ error: q.error.flatten() });
    }
    const tokenHash = hashInviteToken(q.data.token);
    const invite = await getOrgInvitesCollection().findOne({
      tokenHash,
      status: "pending",
    });
    if (!invite || invite.expiresAt.getTime() < Date.now()) {
      return reply.status(404).send({ error: "Invite not found or expired" });
    }
    const org = await getOrgsCollection().findOne({
      _id: new ObjectId(invite.orgId),
    });
    const user = (await getUsersCollection().findOne({
      email: invite.email,
    })) as UserDoc | null;
    return reply.send({
      orgId: invite.orgId,
      orgName: org?.name ?? "(unknown org)",
      orgSlug: org?.slug ?? "",
      email: invite.email,
      role: invite.role,
      needsPassword: !user || user.mustSetPassword === true,
      expiresAt: invite.expiresAt,
    });
  });
}
