# Deploying `nodex-sync-api` (Mongo WPN + auth)

Signed-in **web** and **Electron cloud windows** use the Fastify service in `apps/nodex-sync-api` as WPN source of truth (`/wpn/*`, `/auth/*`). The legacy **headless Express** API (`nodex-api`, `/api/v1/wpn/*` JSON file) is **deprecated** — see `src/nodex-api-server/README.md`.

## Web + API dev checklist

1. Start Mongo: `docker compose up -d mongo-sync` (or use the full default stack below)
2. Start API: `npm run sync-api` (or: `docker compose up -d mongo-sync nodex-sync-api`)
3. Start web: `npm run dev:web` (sets `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API=1` and `NEXT_PUBLIC_NODEX_WEB_BACKEND=sync-only`)
4. Register / sign in via the app (tokens required for WPN mutations, `/me/shell-layout`, builtin plugin render)
5. Bundled Documentation: served anonymously from sync-api at `GET /public/bundled-docs/notes/:id` when `docs/bundled-plugin-authoring` is present in the image or `NODEX_BUNDLED_DOCS_DIR` is set
6. **Automated tests:** Root `npm test` runs Node unit tests under `src/` plus `npm run test -w @nodex/sync-api`. The sync-api suite includes `integration-auth-wpn.test.ts` (register → shell layout → WPN note → built-in markdown render). It **skips** when Mongo is unreachable (`serverSelectionTimeoutMS=2500`). **CI:** start Mongo so that test runs instead of skipping.
   - **GitHub Actions:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — `services: mongo` on `127.0.0.1:27017`, `MONGODB_URI=mongodb://127.0.0.1:27017`, then `npm ci`, `npm run lint`, `npm run test`. A follow-up job runs **Playwright** web smoke (`npm run test:e2e`) after tests pass: same Mongo service, `npx playwright install --with-deps chromium`, then the script builds `@nodex/web`, starts sync-api + Next on non-default ports (see `scripts/e2e-run-web.sh`).
   - **Drone:** [`.drone.yml`](../.drone.yml) — `services: mongo:7` with `MONGODB_URI=mongodb://mongo:27017` on the test step (hostname is the service name), then `npm ci`, `npm run lint`, `npm run test`. (Browser E2E is not wired in Drone; use GHA or run `npm run test:e2e` locally with Mongo up.)

See also: [`docs/web-backend-modes.md`](web-backend-modes.md).

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_NODEX_SYNC_API_URL` | Web build / runtime | Public sync base URL including `/api/v1` (no trailing slash), e.g. `https://api.example.com/api/v1` |
| `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API` | Web (optional) | Set `1` to force sync WPN routing when no URL is baked in |
| `NEXT_PUBLIC_NODEX_WEB_BACKEND` | Web | `sync-only` — disable legacy headless `/api/v1` calls in the shim |
| `NODEX_SYNC_API_URL` | Electron webpack / Node | Same as above when `window.__NODEX_SYNC_API_BASE__` is unset |
| `JWT_SECRET` | sync-api (≥32 chars in prod) | Signs access + refresh tokens |
| `MONGODB_URI` / `MONGODB_DB` | sync-api | Mongo connection (defaults in `server.ts`) |
| `NODEX_BUNDLED_DOCS_DIR` | sync-api | Optional absolute path to bundled markdown (default: packaged `docs/bundled-plugin-authoring`) |

Dev: `resolve-sync-base` falls back to `http://127.0.0.1:4010/api/v1` when `NODE_ENV=development` and nothing else is set.

## Docker Compose (default stack)

Mongo + sync-api + web + gateway (API image: [`Dockerfile.sync-api`](../Dockerfile.sync-api)):

```bash
npm run docker:api:up:detached
# or: docker compose up -d mongo-sync nodex-sync-api nodex-web-blue nodex-gateway
```

Mongo + sync-api only:

```bash
docker compose up -d mongo-sync nodex-sync-api
```

Run the API on the host only (Mongo in Docker):

```bash
docker compose up -d mongo-sync
npm run sync-api
```

Legacy headless Express (`Dockerfile` on port 3847) is opt-in: `docker compose --profile legacy up -d nodex-api`. It is not part of the default gateway stack.

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

## Legacy headless Express

Manual run: `npx tsx src/nodex-api-server/server.ts`. Prefer sync-api for web; see `src/nodex-api-server/README.md`.

See also: `docs/wpn-storage-modes.md`.
