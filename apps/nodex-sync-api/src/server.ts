import Fastify from "fastify";
import cors from "@fastify/cors";
import { NODEX_SYNC_API_V1_PREFIX } from "./api-v1-prefix.js";
import { connectMongo, closeMongo } from "./db.js";
import { registerRoutes } from "./routes.js";

function envString(name: string, fallback = ""): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : fallback;
}

function requireJwtSecret(): string {
  const s = envString("JWT_SECRET");
  const nodeEnv = envString("NODE_ENV", "development");
  if (s.length < 32 && nodeEnv === "production") {
    throw new Error("JWT_SECRET must be at least 32 characters in production");
  }
  if (s.length === 0) {
    if (nodeEnv === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return "dev-only-nodex-sync-secret-min-32-chars!!";
  }
  return s;
}

const port = Number(envString("PORT", "4010")) || 4010;
const host = envString("HOST", "0.0.0.0");
const mongoUri = envString("MONGODB_URI", "mongodb://127.0.0.1:27017");
const mongoDb = envString("MONGODB_DB", "nodex_sync");
const corsOrigin = envString("CORS_ORIGIN", "true");

const app = Fastify({ logger: true });
const jwtSecret = requireJwtSecret();

await app.register(cors, {
  origin:
    corsOrigin === "true" || corsOrigin === "*"
      ? true
      : corsOrigin.split(",").map((o) => o.trim()),
  credentials: true,
  /** Required for browser calls to `/api/v1/*` (e.g. Next on :3000 → sync-api on :4010). */
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "X-Requested-With",
  ],
});

await connectMongo(mongoUri, mongoDb);

await app.register(
  async (scoped) => {
    registerRoutes(scoped, { jwtSecret });
  },
  { prefix: NODEX_SYNC_API_V1_PREFIX },
);

/** Liveness/readiness outside versioned API (Docker healthcheck, simple probes). */
app.get("/health", async (_request, reply) => {
  return reply.send({ ok: true, service: "nodex-sync-api" });
});

const close = async (): Promise<void> => {
  await app.close();
  await closeMongo();
};

process.on("SIGINT", () => {
  void close().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void close().then(() => process.exit(0));
});

try {
  await app.listen({ port, host });
  app.log.info(
    { port, host, mongoDb },
    "Nodex sync API listening (Fastify + MongoDB)",
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
