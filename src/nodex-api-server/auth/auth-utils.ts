import * as crypto from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export type AuthUserPublic = { id: string; email: string; username: string };

export type AccessTokenClaims = {
  sub: string;
  email: string;
  username: string;
};

export function requireAuthJwtSecret(): string {
  const raw = process.env.NODEX_AUTH_JWT_SECRET?.trim();
  if (!raw) {
    throw new Error("Set NODEX_AUTH_JWT_SECRET");
  }
  if (raw.length < 24) {
    throw new Error("NODEX_AUTH_JWT_SECRET is too short (min 24 chars)");
  }
  return raw;
}

export function accessTokenTtlSeconds(): number {
  const raw = process.env.NODEX_AUTH_ACCESS_TTL_SECONDS?.trim();
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 15 * 60;
  return Math.floor(n);
}

export function refreshTtlMs(): number {
  const raw = process.env.NODEX_AUTH_REFRESH_TTL_DAYS?.trim();
  const days = raw ? Number(raw) : NaN;
  const d = Number.isFinite(days) && days > 0 ? days : 30;
  return Math.floor(d * 24 * 60 * 60 * 1000);
}

export function refreshCookieName(): string {
  return process.env.NODEX_AUTH_REFRESH_COOKIE_NAME?.trim() || "nodex_refresh";
}

export function signAccessToken(user: AuthUserPublic): string {
  const secret = requireAuthJwtSecret();
  const claims: AccessTokenClaims = {
    sub: user.id,
    email: user.email,
    username: user.username,
  };
  return jwt.sign(claims, secret, { expiresIn: accessTokenTtlSeconds() });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const secret = requireAuthJwtSecret();
  const decoded = jwt.verify(token, secret) as unknown;
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token");
  }
  const rec = decoded as Record<string, unknown>;
  const sub = typeof rec.sub === "string" ? rec.sub : "";
  const email = typeof rec.email === "string" ? rec.email : "";
  const username = typeof rec.username === "string" ? rec.username : "";
  if (!sub || !email || !username) {
    throw new Error("Invalid token claims");
  }
  return { sub, email, username };
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function newRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

