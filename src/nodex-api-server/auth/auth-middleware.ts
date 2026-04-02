import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AuthUserPublic } from "./auth-utils";

export type AuthedRequest = Request & { user?: AuthUserPublic };

export function authMiddleware(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const header = String(req.header("authorization") ?? "");
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) {
      next();
      return;
    }
    const claims = verifyAccessToken(m[1]!.trim());
    req.user = { id: claims.sub, email: claims.email, username: claims.username };
    next();
  } catch {
    next();
  }
}

export function requireAuth(req: AuthedRequest, res: Response): AuthUserPublic | null {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return req.user;
}

