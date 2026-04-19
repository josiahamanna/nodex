import "./load-root-env.js";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import type { FastifyInstance } from "fastify";
import { NODEX_SYNC_API_V1_PREFIX } from "./api-v1-prefix.js";
import { buildSyncApiApp } from "./build-app.js";
import { closeMongo, connectMongo, getNotificationsCollection } from "./db.js";
import { dropActiveMongoDb, resolveTestMongoUri } from "./test-mongo-helper.js";

const jwtSecret = "dev-only-nodex-sync-secret-min-32-chars!!";

test(
  "Notifications: create, list, mark as read, delete",
  { timeout: 20_000 },
  async (t) => {
    const dbName = `nodex_sync_notif_it_${randomBytes(8).toString("hex")}`;
    let app: FastifyInstance | undefined;

    try {
      await connectMongo(resolveTestMongoUri(), dbName);
    } catch (err) {
      t.skip(`MongoDB not reachable: ${String(err)}`);
      return;
    }

    try {
      app = await buildSyncApiApp({ jwtSecret, corsOrigin: "true", logger: false });

      const userEmail = `user-${Date.now()}@nodex-notif.test`;
      const userPassword = "password12345";
      const reg = await app.inject({
        method: "POST",
        url: `${NODEX_SYNC_API_V1_PREFIX}/auth/register`,
        payload: { email: userEmail, password: userPassword },
      });
      assert.strictEqual(reg.statusCode, 200, reg.body);
      const regJson = JSON.parse(reg.body) as {
        token: string;
        userId: string;
        defaultOrgId: string;
      };

      const userAuth = { authorization: `Bearer ${regJson.token}` };

      const notifications = getNotificationsCollection();
      await notifications.insertOne({
        userId: regJson.userId,
        orgId: regJson.defaultOrgId,
        type: "system",
        title: "Test Notification",
        message: "This is a test notification",
        metadata: { test: true },
        read: false,
        createdAt: new Date(),
        actionUrl: "/test",
      } as never);

      const listResp = await app.inject({
        method: "GET",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications`,
        headers: userAuth,
      });
      assert.strictEqual(listResp.statusCode, 200, listResp.body);
      const listJson = JSON.parse(listResp.body) as {
        notifications: Array<{ id: string; title: string; read: boolean }>;
        total: number;
      };
      assert.strictEqual(listJson.total, 1);
      assert.strictEqual(listJson.notifications[0]!.title, "Test Notification");
      assert.strictEqual(listJson.notifications[0]!.read, false);

      const unreadResp = await app.inject({
        method: "GET",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications/unread-count`,
        headers: userAuth,
      });
      assert.strictEqual(unreadResp.statusCode, 200, unreadResp.body);
      const unreadJson = JSON.parse(unreadResp.body) as { count: number };
      assert.strictEqual(unreadJson.count, 1);

      const notificationId = listJson.notifications[0]!.id;
      const markReadResp = await app.inject({
        method: "PATCH",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications/${notificationId}/read`,
        headers: userAuth,
        payload: { read: true },
      });
      assert.strictEqual(markReadResp.statusCode, 204, markReadResp.body);

      const unreadAfterResp = await app.inject({
        method: "GET",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications/unread-count`,
        headers: userAuth,
      });
      assert.strictEqual(unreadAfterResp.statusCode, 200, unreadAfterResp.body);
      const unreadAfterJson = JSON.parse(unreadAfterResp.body) as { count: number };
      assert.strictEqual(unreadAfterJson.count, 0);

      const deleteResp = await app.inject({
        method: "DELETE",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications/${notificationId}`,
        headers: userAuth,
      });
      assert.strictEqual(deleteResp.statusCode, 204, deleteResp.body);

      const listAfterDeleteResp = await app.inject({
        method: "GET",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications`,
        headers: userAuth,
      });
      assert.strictEqual(listAfterDeleteResp.statusCode, 200, listAfterDeleteResp.body);
      const listAfterDeleteJson = JSON.parse(listAfterDeleteResp.body) as {
        notifications: unknown[];
        total: number;
      };
      assert.strictEqual(listAfterDeleteJson.total, 0);
    } finally {
      await app?.close();
      await dropActiveMongoDb();
      await closeMongo();
    }
  },
);

test(
  "Notifications: org invite creates notification for existing user",
  { timeout: 20_000 },
  async (t) => {
    const dbName = `nodex_sync_notif_invite_${randomBytes(8).toString("hex")}`;
    let app: FastifyInstance | undefined;

    try {
      await connectMongo(resolveTestMongoUri(), dbName);
    } catch (err) {
      t.skip(`MongoDB not reachable: ${String(err)}`);
      return;
    }

    try {
      app = await buildSyncApiApp({ jwtSecret, corsOrigin: "true", logger: false });

      const adminEmail = `admin-${Date.now()}@nodex-notif.test`;
      const adminPassword = "password12345";
      const adminReg = await app.inject({
        method: "POST",
        url: `${NODEX_SYNC_API_V1_PREFIX}/auth/register`,
        payload: { email: adminEmail, password: adminPassword },
      });
      assert.strictEqual(adminReg.statusCode, 200, adminReg.body);
      const adminJson = JSON.parse(adminReg.body) as {
        token: string;
        userId: string;
        defaultOrgId: string;
      };

      const inviteeEmail = `invitee-${Date.now()}@nodex-notif.test`;
      const inviteePassword = "password12345";
      const inviteeReg = await app.inject({
        method: "POST",
        url: `${NODEX_SYNC_API_V1_PREFIX}/auth/register`,
        payload: { email: inviteeEmail, password: inviteePassword },
      });
      assert.strictEqual(inviteeReg.statusCode, 200, inviteeReg.body);
      const inviteeJson = JSON.parse(inviteeReg.body) as {
        token: string;
        userId: string;
      };

      const adminAuth = { authorization: `Bearer ${adminJson.token}` };
      const inviteeAuth = { authorization: `Bearer ${inviteeJson.token}` };

      const createInvite = await app.inject({
        method: "POST",
        url: `${NODEX_SYNC_API_V1_PREFIX}/orgs/${adminJson.defaultOrgId}/invites`,
        headers: adminAuth,
        payload: { email: inviteeEmail, role: "member" },
      });
      assert.strictEqual(createInvite.statusCode, 200, createInvite.body);

      const inviteeNotifs = await app.inject({
        method: "GET",
        url: `${NODEX_SYNC_API_V1_PREFIX}/notifications`,
        headers: inviteeAuth,
      });
      assert.strictEqual(inviteeNotifs.statusCode, 200, inviteeNotifs.body);
      const inviteeNotifsJson = JSON.parse(inviteeNotifs.body) as {
        notifications: Array<{ type: string; title: string }>;
        total: number;
      };
      assert.strictEqual(inviteeNotifsJson.total, 1);
      assert.strictEqual(inviteeNotifsJson.notifications[0]!.type, "org_invite");
      assert.ok(inviteeNotifsJson.notifications[0]!.title.includes("Invitation"));
    } finally {
      await app?.close();
      await dropActiveMongoDb();
      await closeMongo();
    }
  },
);
