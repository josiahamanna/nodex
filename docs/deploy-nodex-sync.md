# Deploying `nodex-sync-api` (Mongo WPN + auth)

Signed-in **web** and **Electron cloud windows** use the Fastify service in `apps/nodex-sync-api` as WPN source of truth (`/wpn/*`, `/auth/*`). The legacy **headless Express** API (`nodex-api`, `/api/v1/wpn/*` JSON file) is **not** SoT for that mode.

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_NODEX_SYNC_API_URL` | Web build / runtime | Public sync base URL (no trailing slash), e.g. `https://api.example.com` |
| `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API` | Web (optional) | Set `1` to force sync WPN routing when no URL is baked in |
| `NODEX_SYNC_API_URL` | Electron webpack / Node | Same as above when `window.__NODEX_SYNC_API_BASE__` is unset |
| `JWT_SECRET` | sync-api (≥32 chars in prod) | Signs access + refresh tokens |
| `MONGODB_URI` / `MONGODB_DB` | sync-api | Mongo connection (defaults in `server.ts`) |

Dev: `resolve-sync-base` falls back to `http://127.0.0.1:4010` when `NODE_ENV=development` and nothing else is set.

## Docker Compose (`profile: sync`)

Mongo for sync:

```bash
docker compose --profile sync up -d mongo-sync
```

Run the API on the host (simplest during development):

```bash
npm run sync-api
```

For production, run `apps/nodex-sync-api` behind your process manager or add a dedicated image/service (not bundled in the default `Dockerfile` today).

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

## Headless API without WPN

You can run **nodex-api** headless for plugins, assets, marketplace, and legacy routes **without** using its JSON workspace as cloud SoT: keep signed-in clients on sync-api for `/wpn/*` only.

See also: `docs/wpn-storage-modes.md`.
