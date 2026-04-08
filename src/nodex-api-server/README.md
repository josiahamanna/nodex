# Legacy headless Express API (deprecated)

This server (`server.ts`) exposed `/api/v1/*` for single-tenant `NODEX_PROJECT_ROOT` workflows and web dev proxies.

**Product direction:** use **[`apps/nodex-sync-api`](../../apps/nodex-sync-api)** (Fastify + Mongo) for web and cloud. See [`docs/deploy-nodex-sync.md`](../../docs/deploy-nodex-sync.md) and [`docs/web-backend-modes.md`](../../docs/web-backend-modes.md).

To run this stack manually (not wired to `npm run`):

```bash
npx tsx src/nodex-api-server/server.ts
```

The Docker image built from the root [`Dockerfile`](../../Dockerfile) still targets this server until deployments migrate to [`Dockerfile.sync-api`](../../Dockerfile.sync-api).
