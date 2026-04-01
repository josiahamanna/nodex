import * as path from "path";
import cors from "cors";
import express from "express";
import { initHeadlessFromEnv } from "./headless-bootstrap";
import { createNodexApiRouter } from "./api-router";
import {
  readMarketplaceS3ConfigFromEnv,
  streamArtifactToResponse,
} from "./marketplace/marketplace-s3";

const init = initHeadlessFromEnv();
if (!init.ok) {
  console.error("[Nodex API]", init.error);
  process.exit(1);
}

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "32mb" }));

function resolveMarketplaceStaticDir(): string {
  const raw = process.env.NODEX_MARKETPLACE_DIR?.trim();
  if (raw) {
    return path.resolve(raw);
  }
  return path.resolve(process.cwd(), "dist", "plugins");
}

const marketS3 = readMarketplaceS3ConfigFromEnv();
if (marketS3) {
  app.get("/marketplace/files/*", async (req, res) => {
    try {
      const objectKey = String(req.params[0] ?? "").replace(/^\/+/, "");
      if (!objectKey) {
        res.status(404).end();
        return;
      }
      await streamArtifactToResponse({ cfg: marketS3, objectKey, req, res });
    } catch (e) {
      res.status(404).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
} else {
  app.use(
    "/marketplace/files",
    express.static(resolveMarketplaceStaticDir(), {
      index: false,
      fallthrough: false,
    }),
  );
}

app.use("/api/v1", createNodexApiRouter());

const PORT = Number(process.env.PORT ?? "3847");
const host = process.env.HOST ?? "127.0.0.1";

const server = app.listen(PORT, host, () => {
  // eslint-disable-next-line no-console
  console.info(
    `[Nodex API] listening on http://${host}:${PORT} (project ${process.env.NODEX_PROJECT_ROOT})`,
  );
});

function shutdown(signal: string) {
  // eslint-disable-next-line no-console
  console.info(`[Nodex API] ${signal} received, closing HTTP server...`);
  server.close((err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error("[Nodex API] error during server.close:", err);
      process.exit(1);
    }
    process.exit(0);
  });
  // Docker / orchestrators will SIGKILL after stop_grace_period; exit hard if close stalls.
  setTimeout(() => {
    // eslint-disable-next-line no-console
    console.error("[Nodex API] shutdown timeout, exiting.");
    process.exit(1);
  }, 9_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
