# Deploying `nodex-sync-api` (Mongo WPN + auth)

Signed-in **web** and **Electron cloud windows** use the Fastify service in `apps/nodex-sync-api` as WPN source of truth (`/wpn/*`, `/auth/*`). The legacy **headless Express** API (`nodex-api`, `/api/v1/wpn/*` JSON file) is **deprecated** — see `src/nodex-api-server/README.md`.

## Web + API dev checklist

1. Start Mongo: `docker compose --profile sync up -d mongo-sync`
2. Start API: `npm run sync-api` (or run both API + DB: `docker compose --profile sync up -d mongo-sync nodex-sync-api`)
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
| `NEXT_PUBLIC_NODEX_SYNC_API_URL` | Web build / runtime | Public sync base URL (no trailing slash), e.g. `https://api.example.com` |
| `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API` | Web (optional) | Set `1` to force sync WPN routing when no URL is baked in |
| `NEXT_PUBLIC_NODEX_WEB_BACKEND` | Web | `sync-only` — disable legacy headless `/api/v1` calls in the shim |
| `NODEX_SYNC_API_URL` | Electron webpack / Node | Same as above when `window.__NODEX_SYNC_API_BASE__` is unset |
| `JWT_SECRET` | sync-api (≥32 chars in prod) | Signs access + refresh tokens |
| `MONGODB_URI` / `MONGODB_DB` | sync-api | Mongo connection (defaults in `server.ts`) |
| `NODEX_BUNDLED_DOCS_DIR` | sync-api | Optional absolute path to bundled markdown (default: packaged `docs/bundled-plugin-authoring`) |

Dev: `resolve-sync-base` falls back to `http://127.0.0.1:4010` when `NODE_ENV=development` and nothing else is set.

## Docker Compose (`profile: sync`)

Mongo + sync-api (API image: [`Dockerfile.sync-api`](../Dockerfile.sync-api)):

```bash
docker compose --profile sync up -d mongo-sync nodex-sync-api
```

Run the API on the host only (Mongo in Docker):

```bash
docker compose --profile sync up -d mongo-sync
npm run sync-api
```

Legacy headless Express (`Dockerfile` on port 3847) remains available for exceptional single-folder workflows; it is no longer the default web backend.

## Nginx gateway (optional same-origin path)

If the browser must call sync-api **same-origin** (avoid CORS), add an upstream and location, e.g. proxy `/backend/sync/` → sync-api root so `/backend/sync/auth/login` → `/auth/login`.

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
