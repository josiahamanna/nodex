import { Router, type Request, type Response, type NextFunction } from "express";
import * as crypto from "crypto";
import * as path from "path";
import { getHeadlessUserDataPath } from "../headless-bootstrap";
import {
  allocId,
  loadMarketplaceState,
  saveMarketplaceState,
  type MarketplaceState,
} from "./marketplace-json";
import {
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from "./marketplace-auth";
import { presignPutArtifact, readMarketplaceS3ConfigFromEnv, headArtifact } from "./marketplace-s3";
import type { MarketplaceIndexEntry } from "../../shared/marketplace-index";

function resolveMarketplaceJsonPath(): string {
  const raw = process.env.NODEX_MARKET_DB_PATH?.trim();
  if (raw) {
    return path.resolve(raw);
  }
  return path.join(getHeadlessUserDataPath(), "marketplace.json");
}

function withMarketplace<T>(fn: (state: MarketplaceState) => T): T {
  const p = resolveMarketplaceJsonPath();
  const state = loadMarketplaceState(p);
  const out = fn(state);
  saveMarketplaceState(p, state);
  return out;
}

type AuthedRequest = Request & { marketplaceUser?: { id: number; email: string } };

function authMiddleware(req: AuthedRequest, _res: Response, next: NextFunction): void {
  try {
    const header = String(req.header("authorization") ?? "");
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      next();
      return;
    }
    const claims = verifyAccessToken(m[1]!.trim());
    const id = Number(claims.sub);
    if (!Number.isFinite(id) || id <= 0) {
      next();
      return;
    }
    req.marketplaceUser = { id, email: claims.email };
    next();
  } catch {
    next();
  }
}

function requireAuth(req: AuthedRequest, res: Response): { id: number; email: string } | null {
  if (!req.marketplaceUser) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.marketplaceUser;
}

function isSafePluginId(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name) && !name.startsWith(".") && name.length <= 80;
}

function isSafeVersion(v: string): boolean {
  return /^[0-9A-Za-z][0-9A-Za-z.+-]{0,39}$/.test(v);
}

function utcPlusMinutes(mins: number): string {
  return new Date(Date.now() + mins * 60_000).toISOString();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createMarketplaceRouter(): Router {
  const router = Router();

  router.use(authMiddleware);

  router.post("/auth/register", async (req, res) => {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !email.includes("@")) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }
    try {
      const hash = await hashPassword(password);
      const now = new Date().toISOString();
      const id = withMarketplace((state) => {
        if (state.users.some((u) => u.email === email)) {
          throw new Error("UNIQUE");
        }
        const nid = allocId(state);
        state.users.push({
          id: nid,
          email,
          password_hash: hash,
          created_at: now,
        });
        return nid;
      });
      res.json({ token: signAccessToken({ id, email }), user: { id, email } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE")) {
        res.status(409).json({ error: "Email already registered" });
        return;
      }
      res.status(400).json({ error: msg });
    }
  });

  router.post("/auth/login", async (req, res) => {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      res.status(400).json({ error: "Missing email/password" });
      return;
    }
    const p = resolveMarketplaceJsonPath();
    const state = loadMarketplaceState(p);
    const row = state.users.find((u) => u.email === email);
    if (!row) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    res.json({
      token: signAccessToken({ id: row.id, email: row.email }),
      user: { id: row.id, email: row.email },
    });
  });

  router.post("/publish/init", async (req, res) => {
    const u = requireAuth(req as AuthedRequest, res);
    if (!u) return;

    const cfg = readMarketplaceS3ConfigFromEnv();
    if (!cfg) {
      res.status(400).json({ error: "Marketplace storage is not configured" });
      return;
    }

    const body = (req.body ?? {}) as {
      name?: unknown;
      version?: unknown;
      contentType?: unknown;
      sizeBytes?: unknown;
      sha256?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const version = typeof body.version === "string" ? body.version.trim() : "";
    const contentType =
      typeof body.contentType === "string" ? body.contentType.trim() : "application/octet-stream";
    const sizeBytes =
      typeof body.sizeBytes === "number" && Number.isFinite(body.sizeBytes) ? body.sizeBytes : -1;
    const sha256 = typeof body.sha256 === "string" ? body.sha256.trim().toLowerCase() : "";

    if (!isSafePluginId(name)) {
      res.status(400).json({ error: "Invalid plugin name" });
      return;
    }
    if (!isSafeVersion(version)) {
      res.status(400).json({ error: "Invalid version" });
      return;
    }
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      res.status(400).json({ error: "sha256 must be a 64-char hex digest" });
      return;
    }
    if (!(sizeBytes > 0 && sizeBytes <= 200 * 1024 * 1024)) {
      res.status(400).json({ error: "sizeBytes out of range" });
      return;
    }

    const objectKey = `plugins/${encodeURIComponent(name)}/${encodeURIComponent(version)}/${name}-${version}.nodexplugin`;
    const finalizeToken = generateFinalizeToken();

    try {
      withMarketplace((state) => {
        let existingPlugin = state.plugins.find((pl) => pl.name === name);
        let pluginId = existingPlugin?.id ?? 0;
        if (existingPlugin) {
          if (existingPlugin.owner_user_id !== u.id) {
            throw new Error("FORBIDDEN_PLUGIN");
          }
        } else {
          pluginId = allocId(state);
          state.plugins.push({
            id: pluginId,
            name,
            owner_user_id: u.id,
            created_at: nowIso(),
          });
        }

        const rel = state.releases.find(
          (r) => r.plugin_id === pluginId && r.version === version,
        );
        if (rel) {
          throw new Error("VERSION_EXISTS");
        }

        state.intents.push({
          id: allocId(state),
          user_id: u.id,
          plugin_name: name,
          version,
          object_key: objectKey,
          sha256,
          content_type: contentType,
          size_bytes: Math.trunc(sizeBytes),
          finalize_token: finalizeToken,
          created_at: nowIso(),
          expires_at: utcPlusMinutes(30),
        });
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "FORBIDDEN_PLUGIN") {
        res.status(403).json({ error: "You do not own this plugin id" });
        return;
      }
      if (msg === "VERSION_EXISTS") {
        res.status(409).json({ error: "Version already published" });
        return;
      }
      res.status(400).json({ error: msg });
      return;
    }

    const { uploadUrl } = await presignPutArtifact({
      cfg,
      objectKey,
      contentType,
      sha256,
      expiresInSeconds: 900,
    });

    res.json({ uploadUrl, objectKey, finalizeToken });
  });

  router.post("/publish/finalize", async (req, res) => {
    const u = requireAuth(req as AuthedRequest, res);
    if (!u) return;

    const cfg = readMarketplaceS3ConfigFromEnv();
    if (!cfg) {
      res.status(400).json({ error: "Marketplace storage is not configured" });
      return;
    }

    const body = (req.body ?? {}) as {
      finalizeToken?: unknown;
      objectKey?: unknown;
      displayName?: unknown;
      description?: unknown;
      markdownFile?: unknown;
    };
    const finalizeToken = typeof body.finalizeToken === "string" ? body.finalizeToken.trim() : "";
    const objectKey = typeof body.objectKey === "string" ? body.objectKey.trim() : "";
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const markdownFile =
      body.markdownFile === null
        ? null
        : typeof body.markdownFile === "string"
          ? body.markdownFile.trim()
          : null;

    if (!finalizeToken || finalizeToken.length < 24) {
      res.status(400).json({ error: "Invalid finalizeToken" });
      return;
    }
    if (!objectKey) {
      res.status(400).json({ error: "Missing objectKey" });
      return;
    }

    const p = resolveMarketplaceJsonPath();
    const state = loadMarketplaceState(p);
    const intentIdx = state.intents.findIndex((i) => i.finalize_token === finalizeToken);
    if (intentIdx < 0) {
      res.status(404).json({ error: "Publish intent not found" });
      return;
    }
    const intent = state.intents[intentIdx]!;
    if (intent.user_id !== u.id) {
      res.status(403).json({ error: "Publish intent does not belong to you" });
      return;
    }
    if (intent.object_key !== objectKey) {
      res.status(400).json({ error: "objectKey mismatch" });
      return;
    }
    if (intent.expires_at < nowIso()) {
      res.status(410).json({ error: "Publish intent expired" });
      return;
    }

    const head = await headArtifact({ cfg, objectKey });
    if (!head.exists) {
      res.status(400).json({ error: "Artifact not uploaded yet" });
      return;
    }
    if (head.sha256 && head.sha256.toLowerCase() !== intent.sha256.toLowerCase()) {
      res.status(400).json({ error: "Artifact sha256 mismatch" });
      return;
    }

    const pluginRow = state.plugins.find((pl) => pl.name === intent.plugin_name);
    if (!pluginRow) {
      res.status(500).json({ error: "Plugin row missing" });
      return;
    }
    if (pluginRow.owner_user_id !== u.id) {
      res.status(403).json({ error: "You do not own this plugin id" });
      return;
    }

    const dup = state.releases.some(
      (r) => r.plugin_id === pluginRow.id && r.version === intent.version,
    );
    if (dup) {
      res.status(409).json({ error: "Version already published" });
      return;
    }

    state.releases.push({
      id: allocId(state),
      plugin_id: pluginRow.id,
      version: intent.version,
      object_key: intent.object_key,
      sha256: intent.sha256,
      content_type: intent.content_type,
      size_bytes: intent.size_bytes,
      created_at: nowIso(),
      status: "published",
    });
    state.intents.splice(intentIdx, 1);
    saveMarketplaceState(p, state);

    const packageFile = path.basename(intent.object_key);
    const entry: MarketplaceIndexEntry = {
      name: intent.plugin_name,
      version: intent.version,
      displayName: displayName || undefined,
      description: description || undefined,
      packageFile,
      markdownFile: markdownFile && markdownFile.length ? markdownFile : null,
    };
    res.json({ success: true, plugin: entry });
  });

  router.get("/auth/me", (req, res) => {
    const u = (req as AuthedRequest).marketplaceUser;
    if (!u) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ user: u });
  });

  return router;
}

export function generateFinalizeToken(): string {
  return crypto.randomBytes(24).toString("hex");
}
