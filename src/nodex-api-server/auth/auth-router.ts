import { Router, type Request, type Response } from "express";
import { getHeadlessUserDataPath } from "../headless-bootstrap";
import {
  emailOrUsernameTaken,
  findRefreshSessionByHash,
  insertRefreshSession,
  insertUser,
  readUserByEmail,
  readUserById,
  revokeRefreshSessionByHashIfActive,
  revokeRefreshSessionById,
  setUserAdminFlag,
  type AuthJsonSessionRow,
} from "./auth-json-store";
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

function requireAuthDataPath(): string {
  const base = getHeadlessUserDataPath()?.trim();
  if (!base) {
    throw new Error(
      "Auth storage unavailable (open a project so headless user data path is set)",
    );
  }
  return base;
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
      const userDataPath = requireAuthDataPath();
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
      if (emailOrUsernameTaken(userDataPath, email, username)) {
        res.status(409).json({ error: "Email or username already registered" });
        return;
      }
      insertUser(userDataPath, {
        id,
        email,
        username,
        password_hash,
        is_admin: isAdmin,
        created_at_ms: t,
        updated_at_ms: t,
      });

      const user: AuthUserPublic & { isAdmin: boolean } = { id, email, username, isAdmin };
      const accessToken = signAccessToken(user);
      const refreshToken = newRefreshToken();
      const refreshHash = hashRefreshToken(refreshToken);
      const expiresAt = t + refreshTtlMs();
      const ua = String(req.header("user-agent") ?? "").slice(0, 500) || null;
      const ip =
        (typeof req.ip === "string" ? req.ip : "")?.slice(0, 100) || null;
      const sess: AuthJsonSessionRow = {
        id: newId(),
        user_id: id,
        refresh_token_hash: refreshHash,
        created_at_ms: t,
        expires_at_ms: expiresAt,
        revoked_at_ms: null,
        user_agent: ua,
        ip,
      };
      insertRefreshSession(userDataPath, sess);
      setRefreshCookie(res, refreshToken);
      res.json({ token: accessToken, user });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/login", async (req: Request, res: Response) => {
    try {
      const userDataPath = requireAuthDataPath();
      const body = (req.body ?? {}) as { email?: unknown; password?: unknown };
      const email =
        typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      if (!email || !password) {
        res.status(400).json({ error: "Missing email/password" });
        return;
      }
      const row = readUserByEmail(userDataPath, email);
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
        setUserAdminFlag(userDataPath, row.id, true, nowMs());
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
      insertRefreshSession(userDataPath, {
        id: newId(),
        user_id: user.id,
        refresh_token_hash: refreshHash,
        created_at_ms: t,
        expires_at_ms: expiresAt,
        revoked_at_ms: null,
        user_agent: ua,
        ip,
      });
      setRefreshCookie(res, refreshToken);
      res.json({ token: accessToken, user });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/refresh", async (req: Request, res: Response) => {
    try {
      const userDataPath = requireAuthDataPath();
      const cookies = parseCookie(req.header("cookie"));
      const token = cookies[refreshCookieName()]?.trim() || "";
      if (!token) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const tokenHash = hashRefreshToken(token);
      const t = nowMs();
      const sess = findRefreshSessionByHash(userDataPath, tokenHash);
      if (!sess || sess.revoked_at_ms != null || !(sess.expires_at_ms > t)) {
        clearRefreshCookie(res);
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      revokeRefreshSessionById(userDataPath, sess.id, t);

      const row = readUserById(userDataPath, sess.user_id);
      if (!row) {
        clearRefreshCookie(res);
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user: AuthUserPublic & { isAdmin: boolean } = {
        id: row.id,
        email: row.email,
        username: row.username,
        isAdmin: row.is_admin === true,
      };
      const accessToken = signAccessToken(user);

      const refreshToken = newRefreshToken();
      const refreshHash = hashRefreshToken(refreshToken);
      const expiresAt = t + refreshTtlMs();
      insertRefreshSession(userDataPath, {
        id: newId(),
        user_id: user.id,
        refresh_token_hash: refreshHash,
        created_at_ms: t,
        expires_at_ms: expiresAt,
        revoked_at_ms: null,
        user_agent: String(req.header("user-agent") ?? "").slice(0, 500) || null,
        ip: (typeof req.ip === "string" ? req.ip : "")?.slice(0, 100) || null,
      });

      setRefreshCookie(res, refreshToken);
      res.json({ token: accessToken, user });
    } catch (e) {
      res.status(503).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });

  router.post("/logout", async (req: Request, res: Response) => {
    try {
      const userDataPath = requireAuthDataPath();
      const cookies = parseCookie(req.header("cookie"));
      const token = cookies[refreshCookieName()]?.trim() || "";
      if (token) {
        const tokenHash = hashRefreshToken(token);
        revokeRefreshSessionByHashIfActive(userDataPath, tokenHash, nowMs());
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
      const header = String(req.header("authorization") ?? "");
      const m = header.match(/^Bearer\s+(.+)$/i);
      if (!m) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const token = m[1]!.trim();
      const { verifyAccessToken } = await import("./auth-utils");
      const claims = verifyAccessToken(token);
      res.json({
        user: {
          id: claims.sub,
          email: claims.email,
          username: claims.username,
          isAdmin: claims.isAdmin,
        },
      });
    } catch (e) {
      res.status(401).json({ error: "Unauthorized" });
    }
  });

  return router;
}
