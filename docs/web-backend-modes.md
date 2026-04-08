# Web backend modes (sync-api vs legacy headless)

The browser shell uses `window.Nodex` from [`src/renderer/nodex-web-shim.ts`](../src/renderer/nodex-web-shim.ts). Supported backends:

| Mode | When | Notes / WPN | Headless `/api/v1` |
|------|------|-------------|-------------------|
| **Sync (default dev)** | `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API=1` and sync base URL resolved ([`resolve-sync-base`](../packages/nodex-platform/src/resolve-sync-base.ts)) | Fastify `nodex-sync-api` `/wpn/*`, `/auth/*`, `/me/*`, `/plugins/builtin-*`, `/public/bundled-docs/*` | Disabled when `NEXT_PUBLIC_NODEX_WEB_BACKEND=sync-only` |
| **Legacy headless** | `NEXT_PUBLIC_NODEX_WEB_BACKEND` unset and not using sync WPN, or `?web=1&api=` pointing at Express | Optional | `http://127.0.0.1:3847` or same-origin proxy |

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_NODEX_SYNC_API_URL` | Web build | Public sync API origin (no trailing slash), e.g. `http://127.0.0.1:4010` |
| `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API` | Web | Set `1` to route WPN to sync-api (required for Mongo WPN in the browser). |
| `NEXT_PUBLIC_NODEX_WEB_BACKEND` | Web | `sync-only` — block legacy headless `webRequest` calls; use sync-api routes only. |
| `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN` | Web | `1` — use relative `/api/v1` (only if you still run a gateway proxy to Express). |
| `NODEX_HEADLESS_API_ORIGIN` | `next.config` | Optional proxy target for legacy Express during migration. |
| `NODEX_HEADLESS_API_ORIGIN_DEV` | `next.config` | Set `1` to default dev proxy to `http://127.0.0.1:3847` (legacy). |
| `MONGODB_URI` / `MONGODB_DB` | sync-api | Mongo connection ([`docs/deploy-nodex-sync.md`](deploy-nodex-sync.md)). |
| `JWT_SECRET` | sync-api | JWT signing (≥32 chars in production). |
| `NODEX_BUNDLED_DOCS_DIR` | sync-api | Optional absolute path to bundled markdown tree (default: repo `docs/bundled-plugin-authoring` relative to package). |

## Running local dev

1. Mongo: `docker compose --profile sync up -d mongo-sync`
2. API: `npm run sync-api`
3. Web: `npm run dev:web` (sets sync WPN + `sync-only` for you)

## Manual headless Express (unsupported)

The former `npm run start:api` entry point was removed from `package.json`. To run the legacy server for debugging:

```bash
npx tsx src/nodex-api-server/server.ts
```

Prefer `nodex-sync-api` for all new work.
