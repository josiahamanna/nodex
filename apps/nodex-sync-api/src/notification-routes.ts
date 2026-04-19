import type { FastifyInstance } from "fastify";
import { ObjectId } from "mongodb";
import { requireAuth } from "./auth.js";
import { getNotificationsCollection } from "./db.js";
import {
  listNotificationsQuery,
  markAsReadBody,
  type NotificationDoc,
} from "./notification-schemas.js";

export function registerNotificationRoutes(
  app: FastifyInstance,
  opts: { jwtSecret: string },
): void {
  const { jwtSecret } = opts;

  app.get("/notifications", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }

    const parsed = listNotificationsQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { type, read, limit, offset } = parsed.data;
    const notifications = getNotificationsCollection();

    const filter: Record<string, unknown> = { userId: auth.sub };
    if (type) {
      filter.type = type;
    }
    if (read !== undefined) {
      filter.read = read;
    }

    const [items, total] = await Promise.all([
      notifications
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset ?? 0)
        .limit(limit ?? 20)
        .toArray(),
      notifications.countDocuments(filter),
    ]);

    return reply.send({
      notifications: items.map((n) => ({
        id: n._id.toHexString(),
        userId: n.userId,
        orgId: n.orgId,
        type: n.type,
        title: n.title,
        message: n.message,
        metadata: n.metadata ?? null,
        read: n.read,
        createdAt: n.createdAt,
        readAt: n.readAt ?? null,
        actionUrl: n.actionUrl ?? null,
      })),
      total,
      limit: limit ?? 20,
      offset: offset ?? 0,
    });
  });

  app.get("/notifications/unread-count", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }

    const notifications = getNotificationsCollection();
    const count = await notifications.countDocuments({
      userId: auth.sub,
      read: false,
    });

    return reply.send({ count });
  });

  app.patch("/notifications/:id/read", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }

    const { id } = request.params as { id: string };
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return reply.status(400).send({ error: "Invalid notification id" });
    }

    const parsed = markAsReadBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const notifications = getNotificationsCollection();
    const update: Record<string, unknown> = { read: parsed.data.read };
    if (parsed.data.read) {
      update.readAt = new Date();
    } else {
      update.readAt = null;
    }

    const result = await notifications.updateOne(
      { _id: oid, userId: auth.sub },
      { $set: update },
    );

    if (result.matchedCount === 0) {
      return reply.status(404).send({ error: "Notification not found" });
    }

    return reply.status(204).send();
  });

  app.patch("/notifications/mark-all-read", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }

    const notifications = getNotificationsCollection();
    await notifications.updateMany(
      { userId: auth.sub, read: false },
      { $set: { read: true, readAt: new Date() } },
    );

    return reply.status(204).send();
  });

  app.delete("/notifications/:id", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }

    const { id } = request.params as { id: string };
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return reply.status(400).send({ error: "Invalid notification id" });
    }

    const notifications = getNotificationsCollection();
    const result = await notifications.deleteOne({
      _id: oid,
      userId: auth.sub,
    });

    if (result.deletedCount === 0) {
      return reply.status(404).send({ error: "Notification not found" });
    }

    return reply.status(204).send();
  });
}
