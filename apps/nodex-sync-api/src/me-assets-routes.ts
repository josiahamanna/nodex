import type { FastifyInstance } from "fastify";
import { requireAuth } from "./auth.js";

/**
 * Placeholder for future user-asset storage (S3, GridFS, etc.).
 * Web `assetUrl` points here when using sync-api; returns 501 until implemented.
 */
export function registerMeAssetsRoutes(
  app: FastifyInstance,
  opts: { jwtSecret: string },
): void {
  const { jwtSecret } = opts;

  app.get("/me/assets/file", async (request, reply) => {
    const auth = await requireAuth(request, reply, jwtSecret);
    if (!auth) {
      return;
    }
    const q = (request.query as { path?: string }).path;
    if (typeof q !== "string" || !q.trim()) {
      return reply.status(400).send({ error: "Missing path query parameter" });
    }
    void q;
    return reply.status(501).send({
      error:
        "Project file assets are not served from sync-api yet. Use the desktop app for asset-backed notes, or embed content in the note body.",
    });
  });
}
