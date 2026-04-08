import jwt, { type SignOptions } from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";

export type JwtPayload = { sub: string; email: string; typ?: string };

export function signToken(
  secret: string,
  payload: JwtPayload,
  expiresIn: string | false = false,
): string {
  const opts: SignOptions = { algorithm: "HS256" };
  if (expiresIn) {
    opts.expiresIn = expiresIn as SignOptions["expiresIn"];
  }
  return jwt.sign(payload, secret, opts);
}

export function signAccessToken(secret: string, payload: JwtPayload): string {
  return signToken(secret, { ...payload, typ: "access" }, "15m");
}

export function signRefreshToken(secret: string, payload: JwtPayload): string {
  return signToken(secret, { ...payload, typ: "refresh" }, "30d");
}

export function verifyToken(secret: string, token: string): JwtPayload {
  const decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  if (
    typeof decoded !== "object" ||
    decoded === null ||
    typeof (decoded as JwtPayload).sub !== "string" ||
    typeof (decoded as JwtPayload).email !== "string"
  ) {
    throw new Error("Invalid token payload");
  }
  return decoded as JwtPayload;
}

export function verifyAccessToken(secret: string, token: string): JwtPayload {
  const p = verifyToken(secret, token);
  if (p.typ === "refresh") {
    throw new Error("Invalid token type");
  }
  return p;
}

export function verifyRefreshToken(secret: string, token: string): JwtPayload {
  const p = verifyToken(secret, token);
  if (p.typ !== "refresh") {
    throw new Error("Invalid refresh token");
  }
  return p;
}

export function authBearerHeader(
  request: FastifyRequest,
): string | undefined {
  const h = request.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) {
    return undefined;
  }
  return h.slice("Bearer ".length).trim();
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  jwtSecret: string,
): Promise<JwtPayload | null> {
  const token = authBearerHeader(request);
  if (!token) {
    await reply.status(401).send({ error: "Missing Authorization bearer token" });
    return null;
  }
  try {
    return verifyAccessToken(jwtSecret, token);
  } catch {
    await reply.status(401).send({ error: "Invalid or expired token" });
    return null;
  }
}
