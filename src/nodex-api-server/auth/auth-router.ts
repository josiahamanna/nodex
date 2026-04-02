import { Router, type Request, type Response } from "express";
import { getWpnPgPool } from "../../core/wpn/wpn-pg-pool";
import { ensureAuthPgSchema } from "../../core/auth/auth-pg-schema";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  newId,
  newRefreshToken,
  hashRefreshToken,
  refreshCookieName,
  refreshTtlMs,
  type AuthUserPublic,
} from "./auth-utils";

function nowMs(): number {
  return Date.now();
}

function parseCookie(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = String(header ?? "");
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function setRefreshCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(refreshCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: refreshTtlMs(),
  });
}

function clearRefreshCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(refreshCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

async function requirePool(): Promise<ReturnType<typeof getWpnPgPool>> {
  const pool = getWpnPgPool();
  if (!pool) {
    throw new Error("Postgres is not configured (set NODEX_PG_DATABASE_URL)");
  }
  await ensureAuthPgSchema(pool);
  return pool;
}

async function readUserByEmail(
  pool: NonNullable<ReturnType<typeof getWpnPgPool>>,
  email: string,
): Promise<{
  id: string;
  email: string;
  username: string;
  password_hash: string;
  is_admin: boolean;
} | null> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    username: string;
    password_hash: string;
    is_admin: boolean;
  }>("SELECT id, email, username, password_hash, is_admin FROM auth_user WHERE email = $1", [email]);
  return rows[0] ?? null;
}

async function readUserById(
  pool: NonNullable<ReturnType<typeof getWpnPgPool>>,
  id: string,
): Promise<AuthUserPublic | null> {
  const { rows } = await pool.query<{ id: string; email: string; username: string; isAdmin: boolean }>(
    'SELECT id, email, username, is_admin AS "isAdmin" FROM auth_user WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

function parseAdminEmailsAllowlist(): Set<string> {
  const raw = process.env.NODEX_AUTH_ADMIN_EMAILS ?? "";
  const parts = raw
    .split(/[,\s]+/g)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set(parts);
}

export function createAuthRouter(): Router {
  const router = Router();
  const adminEmails = parseAdminEmailsAllowlist();

  router.post("/signup", async (req: Request, res: Response) => {
    try {
      const pool = await requirePool();
      const body = (req.body ?? {}) as {
        email?: unknown;
        username?: unknown;
        password?: unknown;
      };
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const username =
        typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !email.includes("@")) {
        res.status(400).json({ error: "Invalid email" });
        return;
      }
      if (!username || username.length < 2) {
        res.status(400).json({ error: "Invalid username" });
        return;
      }
      const password_hash = await hashPassword(password);
      const isAdmin = adminEmails.has(email);
      const id = newId();
      const t = nowMs();
      try {
        await pool.query(
          `INSERT INTO auth_user (id, email, username, password_hash, is_admin, created_at_ms, updated_at_ms)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, email, username, password_hash, isAdmin, t, t],
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/unique/i.test(msg)) {
          res.status(409).json({ error: "Email or username already registered" });
          return;
        }
        res.status(400).json({ error: msg });
        return;
      }

      const user: AuthUserPublic & { isAdmin: boolean } = { id, email, username, isAdmin };
      const accessToken = signAccessToken(user);
      const refreshToken = newRefreshToken();
      const refreshHash = hashRefreshToken(refreshToken);
      const expiresAt = t + refreshTtlMs();
      const ua = String(req.header("user-agent") ?? "").slice(0, 500) || null;
      const ip =
        (typeof req.ip === "string" ? req.ip : "")?.slice(0, 100) || null;
      await pool.query(
        `INSERT INTO auth_refresh_session
         (id, user_id, refresh_token_hash, created_at_ms, expires_at_ms, revoked_at_ms, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)`,
        [newId(), id, refreshHash, t, expiresAt, ua, ip],
      );
      setRefreshCookie(res, refreshToken);
      res.json({ token: accessToken, user });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    try {
      const pool = await requirePool();
      const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) {
        res.status(400).json({ error: "Missing email/password" });
        return;
      }
      const row = await readUserByEmail(pool, email);
      if (!row) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const ok = await verifyPassword(password, row.password_hash);
      if (!ok) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }
      const shouldBeAdmin = adminEmails.has(row.email);
      if (shouldBeAdmin && row.is_admin !== true) {
        await pool.query("UPDATE auth_user SET is_admin = TRUE, updated_at_ms = $1 WHERE id = $2", [
          nowMs(),
          row.id,
        ]);
      }
      const user: AuthUserPublic & { isAdmin: boolean } = {
        id: row.id,
        email: row.email,
        username: row.username,
        isAdmin: row.is_admin === true || shouldBeAdmin,
      };
      const accessToken = signAccessToken(user);
      const refreshToken = newRefreshToken();
      const refreshHash = hashRefreshToken(refreshToken);
      const t = nowMs();
      const expiresAt = t + refreshTtlMs();
      const ua = String(req.header("user-agent") ?? "").slice(0, 500) || null;
      const ip =
        (typeof req.ip === "string" ? req.ip : "")?.slice(0, 100) || null;
      await pool.query(
        `INSERT INTO auth_refresh_session
         (id, user_id, refresh_token_hash, created_at_ms, expires_at_ms, revoked_at_ms, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)`,
        [newId(), user.id, refreshHash, t, expiresAt, ua, ip],
      );
      setRefreshCookie(res, refreshToken);
      res.json({ token: accessToken, user });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/refresh", async (req: Request, res: Response) => {
    try {
      const pool = await requirePool();
      const cookies = parseCookie(req.header("cookie"));
      const token = cookies[refreshCookieName()]?.trim() || "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const tokenHash = hashRefreshToken(token);
      const t = nowMs();
      const { rows } = await pool.query<{
        id: string;
        user_id: string;
        expires_at_ms: number;
        revoked_at_ms: number | null;
      }>(
        `SELECT id, user_id, expires_at_ms, revoked_at_ms
         FROM auth_refresh_session
         WHERE refresh_token_hash = $1`,
        [tokenHash],
      );
      const sess = rows[0];
      if (!sess || sess.revoked_at_ms != null || !(sess.expires_at_ms > t)) {
        clearRefreshCookie(res);
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Rotate refresh token: revoke old session, mint new.
      await pool.query(
        "UPDATE auth_refresh_session SET revoked_at_ms = $1 WHERE id = $2",
        [t, sess.id],
      );

      const user = await readUserById(pool, sess.user_id);
      if (!user) {
        clearRefreshCookie(res);
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const accessToken = signAccessToken(user);

      const refreshToken = newRefreshToken();
      const refreshHash = hashRefreshToken(refreshToken);
      const expiresAt = t + refreshTtlMs();
      await pool.query(
        `INSERT INTO auth_refresh_session
         (id, user_id, refresh_token_hash, created_at_ms, expires_at_ms, revoked_at_ms, user_agent, ip)
         VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)`,
        [
          newId(),
          user.id,
          refreshHash,
          t,
          expiresAt,
          String(req.header("user-agent") ?? "").slice(0, 500) || null,
          (typeof req.ip === "string" ? req.ip : "")?.slice(0, 100) || null,
        ],
      );

      setRefreshCookie(res, refreshToken);
      res.json({ token: accessToken, user });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/logout", async (req: Request, res: Response) => {
    try {
      const pool = await requirePool();
      const cookies = parseCookie(req.header("cookie"));
      const token = cookies[refreshCookieName()]?.trim() || "";
      if (token) {
        const tokenHash = hashRefreshToken(token);
        await pool.query(
          "UPDATE auth_refresh_session SET revoked_at_ms = $1 WHERE refresh_token_hash = $2 AND revoked_at_ms IS NULL",
          [nowMs(), tokenHash],
        );
      }
      clearRefreshCookie(res);
      res.json({ ok: true as const });
    } catch (e) {
      clearRefreshCookie(res);
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.get("/me", async (req: Request, res: Response) => {
    try {
      const pool = await requirePool();
      const header = String(req.header("authorization") ?? "");
      const m = header.match(/^Bearer\s+(.+)$/i);
      if (!m) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      // Token is validated in middleware for protected routes, but `/me` can stand alone.
      // Use the JWT claims as source of truth to avoid a DB read here.
      // If you want strict revocation, switch this to readUserById().
      const token = m[1]!.trim();
      // Lazy import to avoid circular deps if future changes add middleware here.
      const { verifyAccessToken } = await import("./auth-utils");
      const claims = verifyAccessToken(token);
      res.json({
        user: { id: claims.sub, email: claims.email, username: claims.username, isAdmin: claims.isAdmin },
      });
    } catch (e) {
      res.status(401).json({ error: "Unauthorized" });
    }
  });

  return router;
}

