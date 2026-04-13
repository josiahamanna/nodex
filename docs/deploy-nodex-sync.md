# Deploying `nodex-sync-api` (Mongo WPN + auth)

Signed-in **web** and **Electron cloud windows** use the same HTTP contract for WPN + auth (`/api/v1/wpn/*`, `/api/v1/auth/*`, …). That surface is implemented either by the **standalone Fastify** app in [`apps/nodex-sync-api`](../apps/nodex-sync-api) (Docker / `npm run sync-api`) or by **Next.js Route Handlers** in [`apps/nodex-web`](../apps/nodex-web) (`/api/v1/[[...path]]`, same Fastify app via `app.inject`). The legacy **headless Express** stack has been **removed**; use one of these paths or Electron for all supported deployments.

## Web + API dev checklist

Use **one env file** at the **repo root**: copy [`.env.example`](../.env.example) → `.env` (Compose, deploy scripts, `npm run sync-api`, and Next dev all read that path).

1. Start Mongo: `docker compose --profile local-mongo up -d mongo-sync` (or use the full default stack below)
2. Start API: `npm run sync-api` (or: `docker compose --profile local-mongo up -d mongo-sync nodex-sync-api`)
3. Start web: `npm run dev:web` (sets `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API=1` and `NEXT_PUBLIC_NODEX_WEB_BACKEND=sync-only`)
4. Register / sign in via the app (tokens required for WPN mutations, `/me/shell-layout`, builtin plugin render)
5. Bundled Documentation: served anonymously from sync-api at `GET /public/bundled-docs/notes/:id` when `docs/bundled-plugin-authoring` is present in the image or `NODEX_BUNDLED_DOCS_DIR` is set
6. **Automated tests:** Root `npm test` runs Node unit tests under `src/` plus `npm run test -w @nodex/sync-api`. The sync-api suite includes `integration-auth-wpn.test.ts` (register → shell layout → WPN note → built-in markdown render). It **skips** when Mongo is unreachable (`serverSelectionTimeoutMS=2500`). **CI:** start Mongo so that test runs instead of skipping.
   - **GitHub Actions:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `services: mongo` on `127.0.0.1:27017`, `MONGODB_URI=mongodb://127.0.0.1:27017`, then `npm ci`, `npm run lint`, `npm run test`. A follow-up job runs **Playwright** web smoke (`npm run test:e2e`) after tests pass: same Mongo service, `npx playwright install --with-deps chromium`, then the script builds `@nodex/web`, starts sync-api + Next on non-default ports (see `scripts/e2e-run-web.sh`).
   - **Drone:** [`.drone.yml`](../.drone.yml) — `services: mongo:7` with `MONGODB_URI=mongodb://mongo:27017` on the test step (hostname is the service name), then `npm ci`, `npm run lint`, `npm run test`. (Browser E2E is not wired in Drone; use GHA or run `npm run test:e2e` locally with Mongo up.)

See also: [`docs/web-backend-modes.md`](web-backend-modes.md).

## Local dev: three ways to run the API

1. **Standalone Fastify (default for API-focused work)** — `npm run sync-api` on port **4010**; web points at `http://127.0.0.1:4010/api/v1` (or gateway **8080**). Matches [`Dockerfile.sync-api`](../Dockerfile.sync-api).
2. **Full-stack Next (same as Vercel)** — `npm run dev:web` with **`NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1`** (or `NEXT_PUBLIC_NODEX_SYNC_API_URL=http://127.0.0.1:3000/api/v1`). Requires **`MONGODB_URI`**, **`MONGODB_DB`**, and **`JWT_SECRET`** in repo root `.env` so the Next server can run `ensureMongoConnected()` on `/api/v1/*`. No separate `sync-api` process.
3. **Vercel CLI parity** — from repo root: `cd apps/nodex-web && vercel dev` (after `vercel link`) to exercise the same routing and env as production.

`npm run build -w @nodex/web` runs **`npm run build:lib -w @nodex/sync-api`** (compiles `apps/nodex-sync-api/dist`) and copies **`docs/bundled-plugin-authoring`** into `apps/nodex-web/bundled-plugin-authoring` for bundled docs routes.

**Electron static export** (`scripts/build-web-static.js`, `NODEX_NEXT_STATIC_EXPORT=1`) temporarily moves `app/api` and `app/health` out of the Next app tree — Route Handlers are incompatible with `output: "export"`; packaged Electron still talks to a **remote** sync base (`NEXT_PUBLIC_NODEX_SYNC_API_URL`).

## Vercel (Next full-stack)

1. Create a Vercel project with **Root Directory** `apps/nodex-web` (monorepo). The included [`apps/nodex-web/vercel.json`](../apps/nodex-web/vercel.json) runs **`npm ci` from the repo root** so workspace packages resolve, then **`npm run build`** in the web app (prebuild compiles sync-api + copies bundled docs).
2. Set **environment variables** in the Vercel project: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET` (≥32 chars), optional `CORS_ORIGIN` (`true` for permissive dev-style CORS). For public browser + packaged Electron, set **`NEXT_PUBLIC_NODEX_SYNC_API_URL`** to `https://<your-deployment>/api/v1` and **`NEXT_PUBLIC_NODEX_SITE_URL`** to `https://<your-deployment>` (see [`.env.example`](../.env.example)).
3. **MCP browser login (Option B):** On the **same** Vercel project (Next server runs `/api/v1/*` via [`app/api/v1/[[...path]]`](../apps/nodex-web/app/api/v1/[[...path]]/route.ts)), set **`NODEX_MCP_WEB_VERIFY_BASE`** to the **public site origin** with no trailing slash (e.g. `https://<your-deployment>`). That env is read when building `verification_uri` for `POST /auth/mcp/device/start` (`…/mcp-auth?user_code=…`). Scope **`JWT_SECRET`** (and other secrets) to **Production** vs **Preview** to match how you test. After deploy, verify from your machine: `bash scripts/verify-mcp-device-start.sh https://<your-deployment>/api/v1` (expects HTTP 200 and a `verification_uri` line). **Do not set `NODEX_HEADLESS_API_ORIGIN` on Vercel** for colocated API; if it is set by mistake, [`next.config.mjs`](../apps/nodex-web/next.config.mjs) now **ignores** it unless you add **`NODEX_ALLOW_HEADLESS_REWRITE_ON_VERCEL=1`** (escape hatch for rare proxy setups).
4. **`VERCEL=1`** enables shorter Mongo pool sizing inside the driver (`apps/nodex-sync-api` `db.ts`). Optional: `NODEX_SYNC_API_VERBOSE=1` for Fastify request logging on serverless.

`GET /health` is served by Next at the deployment root for probes (same JSON as standalone sync-api).

**Operator check (MCP device start):** From repo root, `npm run verify:mcp-device-start` (or `bash scripts/verify-mcp-device-start.sh <base>`) POSTs to `{base}/auth/mcp/device/start`. Override the default URL with the first argument or `NODEX_SYNC_API_VERIFY_BASE`.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_NODEX_SYNC_API_URL` | Web build / runtime | Public sync base URL including `/api/v1` (no trailing slash), e.g. `https://api.example.com/api/v1` |
| `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API` | Web (optional) | Set `1` to force sync WPN routing when no URL is baked in |
| `NEXT_PUBLIC_NODEX_WEB_BACKEND` | Web | `sync-only` — disable legacy headless `/api/v1` calls in the shim |
| `NODEX_SYNC_API_URL` | Electron webpack / Node | Same as above when `window.__NODEX_SYNC_API_BASE__` is unset |
| `JWT_SECRET` | sync-api (≥32 chars in prod) | Signs access + refresh tokens |
| `MONGODB_URI` / `MONGODB_DB` | sync-api **or** Next server (colocated `/api/v1`) | Mongo connection (defaults in `server.ts`; Next route handler calls the same `ensureMongoConnected()`) |
| `NODEX_BUNDLED_DOCS_DIR` | sync-api / Next | Optional absolute path to bundled markdown (default: packaged `docs/bundled-plugin-authoring`; Next prebuild copies into `apps/nodex-web/bundled-plugin-authoring`) |
| `NODEX_SYNC_API_SERVERLESS` | sync-api | Set automatically when `VERCEL=1`; lowers Mongo `maxPoolSize` for serverless |
| `NODEX_MCP_WEB_VERIFY_BASE` | sync-api / Next | Public site origin (no trailing slash) for MCP device-login links, e.g. `https://your-app.vercel.app`. Used by `POST /auth/mcp/device/start` to build `verification_uri` (`/mcp-auth?user_code=…`). |
| `NODEX_HEADLESS_API_ORIGIN` | `next.config` (local / non-Vercel) | Optional rewrite: proxy `/api/v1` to this origin. **On Vercel** ignored by default (see next row). |
| `NODEX_ALLOW_HEADLESS_REWRITE_ON_VERCEL` | Vercel / Next build | Set `1` only if you **intentionally** want `NODEX_HEADLESS_API_ORIGIN` rewrites on Vercel. Otherwise colocated `/api/v1` stays on the Next server. |

Dev: `resolve-sync-base` falls back to `http://127.0.0.1:4010/api/v1` when `NODE_ENV=development` and nothing else is set.

## Docker Compose (default stack)

Mongo + sync-api + web + gateway (API image: [`Dockerfile.sync-api`](../Dockerfile.sync-api)):

```bash
npm run docker:api:up:detached
# or: docker compose --profile local-mongo up -d mongo-sync nodex-sync-api nodex-web-blue nodex-gateway
```

Mongo + sync-api only:

```bash
docker compose --profile local-mongo up -d mongo-sync nodex-sync-api
```

Run the API on the host only (Mongo in Docker):

```bash
docker compose --profile local-mongo up -d mongo-sync
npm run sync-api
```

**Production (remote Mongo, no `mongo:7` image):** set `MONGODB_URI` in the repo root `.env` to your Atlas / host URI (must not use hostname `mongo-sync`). `npm run deploy` and `docker-stack-boot.sh` then default **`NODEX_LOCAL_MONGO=0`** and skip `mongo-sync`. Override with explicit `NODEX_LOCAL_MONGO=1` if you still want the compose Mongo container.

## Nginx gateway (optional same-origin path)

The default Docker **`nodex-gateway`** ([`deploy/nginx-gateway.conf`](../deploy/nginx-gateway.conf)) proxies **`GET /health`** to sync-api’s root probe and **`/api/v1/`** to **`nodex-sync-api`**. Build the web image with **`NEXT_PUBLIC_NODEX_SYNC_API_URL`** including **`/api/v1`** (default in Compose: `http://127.0.0.1:8080/api/v1`).

For a **custom** path prefix (e.g. `/backend/sync/` → sync-api `/api/v1/`), add an upstream and `rewrite`/`proxy_pass` rules so browser-visible paths map to `/api/v1/...` on Fastify.

Example fragment (adjust host/port or Docker DNS name):

```nginx
upstream nodex_sync {
    server host.docker.internal:4010;  # or nodex-sync-api:4010 when that service exists
}

location /backend/sync/ {
    proxy_pass http://nodex_sync/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then set:

`NEXT_PUBLIC_NODEX_SYNC_API_URL` to the **browser-visible** origin + path prefix (e.g. `https://your.domain/backend/sync` — no trailing slash).

See also: `docs/wpn-storage-modes.md`.
