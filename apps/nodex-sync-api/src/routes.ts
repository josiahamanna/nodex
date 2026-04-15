import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  requireAuth,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./auth.js";
import type { SyncNoteDoc, UserDoc } from "./db.js";
import { getNotesCollection, getUsersCollection } from "./db.js";
import { registerBuiltinPluginRoutes } from "./builtin-plugin-routes.js";
import { registerBundledDocsPublicRoutes } from "./bundled-docs-routes.js";
import { registerMeAssetsRoutes } from "./me-assets-routes.js";
import { registerMeRoutes } from "./me-routes.js";
import { registerWpnBatchRoutes } from "./wpn-batch-routes.js";
import { registerWpnReadRoutes } from "./wpn-routes.js";
import { registerWpnWriteRoutes } from "./wpn-write-routes.js";
import { registerMcpDeviceAuthRoutes } from "./mcp-device-auth-routes.js";
import { registerWpnImportExportRoutes } from "./wpn-import-export-routes.js";
import {
  buildSessionsAfterAppend,
  rotateRefreshSession,
  userHasRefreshJti,
} from "./refresh-sessions.js";

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
});

const loginBody = registerBody.extend({
  /** When `mcp`, refresh token uses NODEX_JWT_MCP_REFRESH_EXPIRES (default 7d). */
  client: z.enum(["mcp"]).optional(),
});

const refreshBody = z.object({
  refreshToken: z.string().min(10),
});

const syncPushBody = z.object({
  collection: z.literal("notes"),
  documents: z
    .array(
      z.object({
        id: z.string().uuid(),
        updatedAt: z.number(),
        deleted: z.boolean(),
        version: z.number().int(),
        title: z.string(),
        content: z.string(),
        type: z.enum(["markdown", "text", "code"]),
      }),
    )
    .max(500),
});

export function registerRoutes(
  app: FastifyInstance,
  opts: { jwtSecret: string },
): void {
  const { jwtSecret } = opts;

  registerBundledDocsPublicRoutes(app);
  registerWpnReadRoutes(app, { jwtSecret });
  registerWpnWriteRoutes(app, { jwtSecret });
  registerWpnBatchRoutes(app, { jwtSecret });
  registerMeRoutes(app, { jwtSecret });
  registerMeAssetsRoutes(app, { jwtSecret });
  registerBuiltinPluginRoutes(app, { jwtSecret });
  registerMcpDeviceAuthRoutes(app, { jwtSecret });
  app.register(
    async (scoped) => registerWpnImportExportRoutes(scoped, { jwtSecret }),
  );

  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const users = getUsersCollection();
    const existing = await users.findOne({ email: email.toLowerCase() });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const ins = await users.insertOne({
      email: email.toLowerCase(),
      passwordHash,
    });
    const userId = ins.insertedId.toHexString();
    const payload = {
      sub: userId,
      email: email.toLowerCase(),
    };
    const jti = randomUUID();
    const token = signAccessToken(jwtSecret, payload);
    const refreshToken = signRefreshToken(jwtSecret, payload, jti);
    await users.updateOne(
      { _id: ins.insertedId },
      { $set: { refreshSessions: [{ jti, createdAt: new Date() }] } },
    );
    return reply.send({ token, refreshToken, userId });
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { email, password } = parsed.data;
    const users = getUsersCollection();
    const user = await users.findOne({ email: email.toLowerCase() });
    if (!user) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }
    const userId = user._id.toHexString();
    const payload = { sub: userId, email: user.email };
    const jti = randomUUID();
    const sessionVariant = parsed.data.client === "mcp" ? "mcp" : "default";
    const token = signAccessToken(jwtSecret, payload, sessionVariant);
    const refreshToken = signRefreshToken(jwtSecret, payload, jti, sessionVariant);
    const nextSessions = buildSessionsAfterAppend(user as UserDoc, jti);
    await users.updateOne(
      { _id: user._id },
      { $set: { refreshSessions: nextSessions }, $unset: { activeRefreshJti: "" } },
    );
    return reply.send({ token, refreshToken, userId });
  });

  app.post("/auth/refresh", async (request, reply) => {
    const parsed = refreshBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    try {
      const p = verifyRefreshToken(jwtSecret, parsed.data.refreshToken);
      const users = getUsersCollection();
      let userId: ObjectId;
      try {
        userId = new ObjectId(p.sub);
      } catch {
        return reply.status(401).send({ error: "Invalid or expired refresh token" });
      }
      const user = (await users.findOne({ _id: userId })) as UserDoc | null;
      if (!user || !userHasRefreshJti(user, p.jti)) {
        return reply.status(401).send({ error: "Invalid or expired refresh token" });
      }
      const newJti = randomUUID();
      const nextSessions = rotateRefreshSession(user, p.jti, newJti);
      if (!nextSessions) {
        return reply.status(401).send({ error: "Invalid or expired refresh token" });
      }
      await users.updateOne(
        { _id: userId },
        { $set: { refreshSessions: nextSessions }, $unset: { activeRefreshJti: "" } },
      );
      const sessionVariant = p.mcp === true ? "mcp" : "default";
      const token = signAccessToken(
        jwtSecret,
        { sub: p.sub, email: p.email },
        sessionVariant,
      );
      const refreshToken = signRefreshToken(
        jwtSecret,
        { sub: p.sub, email: p.email },
        newJti,
        sessionVariant,
      );
      return reply.send({ token, refreshToken });
    } catch {
      return reply.status(401).send({ error: "Invalid or expired refresh token" });
    }
  });

  app.post("/sync/push", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const parsed = syncPushBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const userId = auth.sub;
    const notes = getNotesCollection();
    const accepted: string[] = [];
    const conflicts: Omit<SyncNoteDoc, "userId">[] = [];

    for (const doc of parsed.data.documents) {
      const filter = { id: doc.id, userId };
      const existing = await notes.findOne(filter);
      if (existing && existing.updatedAt > doc.updatedAt) {
        const { userId: _uid, ...rest } = existing;
        conflicts.push(rest);
        continue;
      }
      const toWrite: SyncNoteDoc = {
        ...doc,
        userId,
      };
      await notes.replaceOne(filter, toWrite, { upsert: true });
      accepted.push(doc.id);
    }

    return reply.send({ accepted, conflicts });
  });

  app.get("/sync/pull", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const q = z
      .object({
        collection: z.literal("notes"),
        since: z.coerce.number(),
      })
      .safeParse(request.query);
    if (!q.success) {
      return reply.status(400).send({ error: q.error.flatten() });
    }
    const userId = auth.sub;
    const notes = getNotesCollection();
    const since = q.data.since;
    const cursor = notes.find({
      userId,
      updatedAt: { $gt: since },
    });
    const list = await cursor.sort({ updatedAt: 1 }).toArray();
    const documents = list.map(({ userId: _u, ...rest }) => rest);
    return reply.send({
      documents,
      lastSync: Date.now(),
    });
  });

  app.get("/health", async (_request, reply) => {
    return reply.send({ ok: true, service: "nodex-sync-api" });
  });

  /** Debug: resolve user from JWT (same as sync auth). */
  app.get("/auth/me", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const users = getUsersCollection();
    let email = auth.email;
    try {
      const u = await users.findOne({ _id: new ObjectId(auth.sub) });
      if (u) {
        email = u.email;
      }
    } catch {
      /* invalid ObjectId */
    }
    return reply.send({ userId: auth.sub, email });
  });
}
