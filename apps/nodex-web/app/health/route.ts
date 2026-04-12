export const runtime = "nodejs";

/** Liveness probe (matches standalone `nodex-sync-api` `GET /health`). */
export function GET() {
  return Response.json({ ok: true, service: "nodex-sync-api" });
}
