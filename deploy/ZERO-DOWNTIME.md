# Zero-downtime local deploy (Docker + Cloudflare Tunnel)

The stack uses **one `nodex-api`** (do not run two API containers against the same **`NODEX_HOST_PROJECT`** / `/workspace` mount — the workspace JSON file is single-writer) and **two UI containers** (`nodex-web-blue`, `nodex-web-green`) so you can rebuild and swap the web tier without dropping the tunnel upstream.

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

## Bring the stack up

**Recommended (`npm run deploy` — API + web blue + gateway on :8080):**

```bash
npm run deploy
```

This starts **`nodex-api`**, **`nodex-web-blue`**, and **`nodex-gateway`**, then runs the blue/green web image build/swap. WPN and notes persist in the **mounted project folder** (`data/nodex-workspace.json` under the bind mount). Open `http://127.0.0.1:8080`.

Subsequent UI-only updates: `npm run deploy` again, or `npm run deploy:web-only` if the stack is already running.

**API + gateway with a specific host project:**

```bash
export NODEX_HOST_PROJECT=/absolute/path/to/project
npm run docker:api:up
# or detached:
npm run docker:api:up:detached
```

This starts `nodex-web-blue`, `nodex-api`, and `nodex-gateway`. Traffic to `/` uses `deploy/nginx-active-web.upstream.conf` (starts on **blue**).

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

`docker:web:swap` only reloads nginx inside **`nodex-gateway`**. Bring the stack up first (same project directory, with `NODEX_HOST_PROJECT` set):

```bash
export NODEX_HOST_PROJECT=/absolute/path/to/project
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

`nodex-api` handles **SIGTERM** / **SIGINT** by closing the HTTP server so in-flight requests can finish (within the stop timeout Docker gives the container). Align Docker `stop_grace_period` if you need longer drains.
