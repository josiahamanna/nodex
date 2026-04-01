import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export type MarketplaceJwtClaims = {
  sub: string; // user id
  email: string;
};

export function requireJwtSecret(): string {
  const raw = process.env.NODEX_MARKET_JWT_SECRET?.trim();
  if (!raw) {
    throw new Error("Set NODEX_MARKET_JWT_SECRET for marketplace auth");
  }
  if (raw.length < 24) {
    throw new Error("NODEX_MARKET_JWT_SECRET is too short (min 24 chars)");
  }
  return raw;
}

export function signAccessToken(user: { id: number; email: string }): string {
  const secret = requireJwtSecret();
  const claims: MarketplaceJwtClaims = { sub: String(user.id), email: user.email };
  return jwt.sign(claims, secret, { expiresIn: "12h" });
}

export function verifyAccessToken(token: string): MarketplaceJwtClaims {
  const secret = requireJwtSecret();
  const decoded = jwt.verify(token, secret) as unknown;
  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token");
  }
  const rec = decoded as Record<string, unknown>;
  const sub = typeof rec.sub === "string" ? rec.sub : "";
  const email = typeof rec.email === "string" ? rec.email : "";
  if (!sub || !email) {
    throw new Error("Invalid token claims");
  }
  return { sub, email };
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

