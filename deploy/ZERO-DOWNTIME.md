# Zero-downtime local deploy (Docker + Cloudflare Tunnel)

The default stack uses **Mongo** (`mongo-sync`), **`nodex-sync-api`** (Fastify on 4010), **`nodex-gateway`** (nginx), and **two UI containers** (`nodex-web-blue`, `nodex-web-green`) so you can rebuild and swap the web tier without dropping the tunnel upstream.

Optional **legacy** headless Express (`nodex-api`, JSON workspace on port 3847) is available with `docker compose --profile legacy` — do not run two `nodex-api` replicas against the same **`NODEX_HOST_PROJECT`** mount.

## Stable URL for `cloudflared`

Point your tunnel at the **gateway**, not at a single web container:

```yaml
# ~/.cloudflared/config.yml (example ingress fragment)
ingress:
  - hostname: your-app.example.com
    service: http://127.0.0.1:8080
  - service: http_status:404
```

Default gateway host port is **`8080`** (`NODEX_GATEWAY_PORT`). To keep the previous default of **5555**:

```bash
NODEX_GATEWAY_PORT=5555 npm run docker:api:up
```

When you change the gateway port, set **`NEXT_PUBLIC_NODEX_SYNC_API_URL`** at web image build time to gateway origin + **`/api/v1`** (e.g. `http://127.0.0.1:5555/api/v1`).

## Bring the stack up

**Recommended (`npm run deploy` — Mongo + sync-api + web blue + gateway on :8080):**

```bash
npm run deploy
```

This starts **`mongo-sync`**, **`nodex-sync-api`**, **`nodex-web-blue`**, and **`nodex-gateway`**, then runs the blue/green web image build/swap. WPN and auth data persist in **Mongo**. Open `http://127.0.0.1:8080`.

Subsequent UI-only updates: `npm run deploy` again, or `npm run deploy:web-only` if the stack is already running.

**Compose only (detached):**

```bash
npm run docker:api:up:detached
```

This starts the default services above. Traffic to `/` uses `deploy/nginx-active-web.upstream.conf` (starts on **blue**). **`/api/v1/*`** (and **`GET /health`**) are proxied to **nodex-sync-api** by the gateway.

**Legacy headless API + bind mount (optional):**

```bash
export NODEX_HOST_PROJECT=/absolute/path/to/project
docker compose --profile legacy up -d nodex-api
```

## Zero-downtime UI update (blue/green)

1. Build a new web image (or `docker compose build nodex-web-green`).
2. Start the **inactive** color (green if blue is live):

   ```bash
   docker compose --profile green up -d nodex-web-green
   ```

3. Wait until the new container is **healthy**, then switch the gateway upstream and reload nginx:

   ```bash
   ./scripts/docker-web-swap.sh green
   ```

4. Rebuild/restart **blue** on the next cycle, or stop the old container to save RAM:

   ```bash
   ./scripts/docker-web-swap.sh green --stop-old
   ```

To switch back to blue:

```bash
docker compose up -d nodex-web-blue   # if stopped
./scripts/docker-web-swap.sh blue
```

## NPM helper

```bash
npm run docker:web:swap -- green
npm run docker:web:swap -- blue
npm run docker:web:swap -- green --stop-old
```

## Troubleshooting

### `No such container: nodex-gateway`

`docker:web:swap` only reloads nginx inside **`nodex-gateway`**. Bring the stack up first (same project directory):

```bash
npm run docker:api:up:detached
```

Then run the swap again.

### `Found orphan containers ([nodex-web])`

The compose file used to define a service named `nodex-web`; it was renamed to `nodex-web-blue`. Remove the old container once:

```bash
docker compose down --remove-orphans
# then start again: npm run docker:api:up:detached
```

## WebSockets and long requests

`deploy/nginx-gateway.conf` sets `proxy_read_timeout` / `proxy_send_timeout` to **3600s** on UI and API routes and forwards `Upgrade` / `Connection` for WebSockets.

## API graceful shutdown

`nodex-sync-api` and legacy **`nodex-api`** handle **SIGTERM** / **SIGINT** by closing the HTTP server so in-flight requests can finish (within the stop timeout Docker gives the container). Align Docker `stop_grace_period` if you need longer drains.
