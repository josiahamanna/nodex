# Web backend modes (sync-api)

The browser shell uses `window.Nodex` from [`src/renderer/nodex-web-shim.ts`](../src/renderer/nodex-web-shim.ts). **Supported path:** Fastify **`nodex-sync-api`** (Mongo WPN + auth). The legacy Express headless stack has been **removed** from this repository.

| Mode | When | Notes / WPN | `/api/v1` shim |
|------|------|-------------|----------------|
| **Sync (default)** | `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API=1` and sync base URL resolved ([`resolve-sync-base`](../packages/nodex-platform/src/resolve-sync-base.ts)) | Same routes as Fastify **`nodex-sync-api`**: `/wpn/*`, `/auth/*`, `/me/*`, `/plugins/builtin-*`, `/public/bundled-docs/*` — served either by **standalone Fastify** (`npm run sync-api`) or **Next** [`app/api/v1/[[...path]]`](../apps/nodex-web/app/api/v1/[[...path]]/route.ts) (Mongo + JWT on the Next server). | Same-origin or absolute `NEXT_PUBLIC_NODEX_SYNC_API_URL`; `NEXT_PUBLIC_NODEX_WEB_BACKEND=sync-only` blocks legacy-only `webRequest` paths |

## Environment variables

| Variable | Where | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_NODEX_SYNC_API_URL` | Web build | Public sync API base (no trailing slash), including `/api/v1`, e.g. `http://127.0.0.1:4010/api/v1` or `http://127.0.0.1:8080/api/v1` behind the default Docker gateway |
| `NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API` | Web | Set `1` to route WPN to sync-api (required for Mongo WPN in the browser). |
| `NEXT_PUBLIC_NODEX_WEB_BACKEND` | Web | `sync-only` — use sync-api routes only (default in `npm run dev:web`). |
| `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN` | Web | `1` — use relative `/api/v1` through the gateway. |
| `NODEX_HEADLESS_API_ORIGIN` | `next.config` | **Rare:** optional Next rewrite proxy for `/api/v1` during custom migrations (leave unset by default). |
| `MONGODB_URI` / `MONGODB_DB` | sync-api **or** Next (colocated API) | Mongo connection ([`docs/deploy-nodex-sync.md`](deploy-nodex-sync.md)); repo root `.env` for local dev. |
| `JWT_SECRET` | sync-api **or** Next (colocated API) | JWT signing (≥32 chars in production). |
| `NODEX_BUNDLED_DOCS_DIR` | sync-api / Next | Optional absolute path to bundled markdown tree (Next build copies docs into `apps/nodex-web/bundled-plugin-authoring` when unset). |

## Running local dev

**Option A — separate API (default in docs checklist):**

1. Mongo: `docker compose --profile local-mongo up -d mongo-sync`
2. API: `npm run sync-api`
3. Web: `npm run dev:web` (sets sync WPN + `sync-only`)

**Option B — full-stack Next only:** Mongo + `npm run dev:web` with `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1` and `MONGODB_URI` / `JWT_SECRET` in `.env` so `/api/v1/*` is handled inside Next (no process on 4010).

Self-hosted operators should run **`nodex-sync-api`** or **Next + colocated routes** (see [`docs/deploy-nodex-sync.md`](deploy-nodex-sync.md)) or use **Electron** for the local file vault; there is no in-repo Express replacement.

## Packaged Electron (cloud WPN)

The renderer loads from **`file://`**, so **`NEXT_PUBLIC_NODEX_API_SAME_ORIGIN` does not apply**. Bake **`NEXT_PUBLIC_NODEX_SYNC_API_URL=https://<your-host>/api/v1`** (Vercel or gateway) into the web build that Forge packages, or set **`window.__NODEX_SYNC_API_BASE__`** at runtime. CORS + JWT behave like calls to standalone Fastify: use `CORS_ORIGIN=true` (or list origins) on the server; the client sends `Authorization: Bearer …`.
