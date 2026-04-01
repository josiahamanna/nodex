import cors from "cors";
import express from "express";
import { initHeadlessFromEnv } from "./headless-bootstrap";
import { createNodexApiRouter } from "./api-router";

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

app.use("/api/v1", createNodexApiRouter());

const PORT = Number(process.env.PORT ?? "3847");
const host = process.env.HOST ?? "127.0.0.1";
app.listen(PORT, host, () => {
  // eslint-disable-next-line no-console
  console.info(
    `[Nodex API] listening on http://${host}:${PORT} (project ${process.env.NODEX_PROJECT_ROOT})`,
  );
});
