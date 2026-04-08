# Jenkins release / deploy

The root [`Jenkinsfile`](../../Jenkinsfile) defaults to **`FULL_DEPLOY`**: `npm run deploy -- --stop-old` from a clean checkout, which drives Docker Compose and the UI blue/green flow ([`scripts/docker-full-deploy.sh`](../../scripts/docker-full-deploy.sh)). Uncheck **`FULL_DEPLOY`** to use **optional targets** (run in order when enabled): **API** → **gateway** → **web** (`deploy:web-only`). For cold starts or simplicity, keep **`FULL_DEPLOY`** or enable all three. **`Verify`** runs after full deploy, gateway-only, or web-only builds; it prints **`docker ps`** for `nodex-*` on **the Jenkins agent** and checks **`nodex-gateway`**. Gateway-only can fail if [`deploy/nginx-active-web.upstream.conf`](../../deploy/nginx-active-web.upstream.conf) names a web container that is not on the Docker network yet — align the active color with a running `nodex-web-blue` / `nodex-web-green`, or use **`FULL_DEPLOY`**. Use **Console Output** if you do not have SSH to the server.

## No SSH to the agent

- **Containers live on the machine that runs the job** (the Jenkins agent), not on your laptop. Running `docker ps` on your PC will **not** show `nodex-gateway` from a Jenkins deploy.
- Open the build in Jenkins → **Console Output**. After a green build, **Verify** lists Nodex containers and confirms the gateway; the printed URL (`http://127.0.0.1:8080/`) is reachable **only from that agent** (or via **cloudflared** / a reverse proxy you configure there).
- To reach the app from the internet, run **cloudflared** (or similar) **on the same host as the agent**, or use a **remote SSH** / **VPN** setup an admin provides. Set `NODEX_GATEWAY_PORT` in the Jenkins job if it is not **8080**.

## Cloudflare Tunnel on the Jenkins agent (public URL)

`cloudflared` must run on the **Jenkins agent host** — the same machine where `docker ps` shows `nodex-gateway`. It does **not** run inside the Jenkins job container unless your agent *is* Docker-in-Docker (then use the parent host’s loopback or service name).

1. **Install** [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) on that host.
2. **Authenticate** once (as the OS user that will run the tunnel), e.g. `cloudflared tunnel login`, then create a tunnel in the Cloudflare dashboard and download credentials.
3. **Ingress** must target the **gateway**, not the web container directly. Default Compose maps the gateway to host **`127.0.0.1:8080`** (not `:808` — use **8080** unless you changed `NODEX_GATEWAY_PORT` in the nodex repo `.env` on the agent).

   Example fragment (full file: [cloudflared-config.example.yml](cloudflared-config.example.yml)):

   ```yaml
   tunnel: YOUR_TUNNEL_UUID
   credentials-file: /path/to/YOUR_TUNNEL_UUID.json
   ingress:
     - hostname: nodex.example.com
       service: http://127.0.0.1:8080
     - service: http_status:404
   ```

   Same-origin `/api/v1` through the browser depends on this: the UI is built with `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1` and expects the **hostname** users open to match the gateway (see [`deploy/ZERO-DOWNTIME.md`](../ZERO-DOWNTIME.md)).

4. **Run as a service** so it survives reboot — copy and edit [`deploy/systemd/cloudflared.service.example`](../systemd/cloudflared.service.example), then `sudo systemctl enable --now cloudflared`. Set `User=` to the account that owns `~/.cloudflared` (often `root` or a dedicated user; the `jenkins` user is only needed if credentials live in its home).

### Reverse proxy instead of Cloudflare

Any proxy on the agent (Caddy, Traefik, host nginx) can **`proxy_pass http://127.0.0.1:8080`** (or your `NODEX_GATEWAY_PORT`). Terminate TLS on the proxy; the gateway stays HTTP on the Docker bridge.

## Agent checklist

Confirm the machine or container that runs the job has:

1. **Bash** — the pipeline uses `bash`; do not rely on `/bin/sh` (dash) with NVM.
2. **Node.js 22** — either on `PATH`, or **NVM** installed for the Jenkins user with `nvm install 22` run once. [`scripts/jenkins-with-node22.sh`](../../scripts/jenkins-with-node22.sh) picks system Node 22 first, otherwise loads `$NVM_DIR/nvm.sh` (default `$HOME/.nvm`). Override with `NVM_DIR` in the job environment if NVM lives elsewhere.
3. **Docker CLI and Compose v2** — same daemon that should run the stack; the `jenkins` user must be able to run `docker` and `docker compose` (group membership or equivalent socket access).
4. **Repository root as `WORKSPACE`** — the job must check out this repo so `package.json` and `scripts/` are at the top level of the workspace (use **Checkout** to the default workspace or set `subdir` consistently).

## Docker: `nodex-gateway` / fixed `container_name` already in use

Compose uses fixed `container_name` values (see [`docker-compose.yml`](../../docker-compose.yml)). Docker allows each name only once per daemon.

- **Stopped leftovers** — [`scripts/docker-full-deploy.sh`](../../scripts/docker-full-deploy.sh) can remove **stopped** `nodex-gateway`, `nodex-api`, or web slots when they block a recreate.
- **Wrong Compose project** — Compose labels each container with `com.docker.compose.project` (default: checkout directory basename, e.g. `nodex-studio`). If the [`Jenkinsfile`](../../Jenkinsfile) sets **`COMPOSE_PROJECT_NAME=nodex`** but old containers still belong to `nodex-studio`, Compose tries to **create** new containers and hits a name conflict. The deploy script **removes** gateway, API, and web slots whose project label **does not** match the current `COMPOSE_PROJECT_NAME`, then recreates them under the correct project (named volumes such as `nodex-user-data` are unchanged).
- **Local dev** — If you do not set `COMPOSE_PROJECT_NAME`, the script defaults it to the repo directory basename, matching Compose’s usual behavior.

## Why a naive `sh` + hard-coded NVM path fails

- Jenkins `sh` often runs **dash**, not bash; **NVM is not reliable** under dash.
- **`/var/lib/jenkins/.nvm` only works** if that is the agent user’s home and NVM was installed there. Prefer `$HOME/.nvm` or set `NVM_DIR` explicitly.

## Secrets and environment variables

[`scripts/docker-full-deploy.sh`](../../scripts/docker-full-deploy.sh) generates a random **`NODEX_AUTH_JWT_SECRET`** when unset, which **invalidates existing sessions** on each deploy. For production, bind a stable secret in Jenkins:

1. Add a **Secret text** credential (for example ID `nodex-auth-jwt-secret`).
2. In the `Jenkinsfile`, uncomment the `NODEX_*` credential lines inside `environment { }` and match the credential IDs to what you created.

Optional overrides (same as local deploy): `NODEX_WPN_DEFAULT_OWNER`, `NODEX_HOST_PROJECT`, `NODEX_GATEWAY_PORT`, etc. Set them on the job or via an **Inject environment variables** / **Credentials** binding.

## Web deploy: `container ... is not running` during UI wait

Docker’s **HEALTHCHECK** runs **`docker exec`** into the UI container on a timer. If the Next.js process **dies**, the daemon keeps trying and can log **`Error response from daemon: container … is not running`**, which Jenkins may show even though the real issue is **why the app exited**.

[`scripts/docker-web-deploy.sh`](../../scripts/docker-web-deploy.sh) **does not** set `HEALTHCHECK` on `docker run` UI slots; it waits for **HTTP :3000** via **`docker exec` into the web container** hitting `127.0.0.1` (avoids cross-container DNS/IPv6 quirks). If deploy still fails, the script prints **`docker logs`** for the web container.

## Docker build: `npm error network read ECONNRESET`

The web image runs `npm ci` inside [`Dockerfile.web`](../../Dockerfile.web). If the build fails with **ECONNRESET** or similar, the Jenkins host or Docker’s network path to the npm registry dropped mid-download — not an application bug.

- Images set **npm fetch retries** (see `Dockerfile.web` / `Dockerfile`) to ride out brief blips.
- If it keeps failing: check outbound HTTPS from the agent, corporate **proxy** (set `HTTP_PROXY` / `HTTPS_PROXY` as Docker **build args** or daemon config), registry mirrors, or re-run the job.

## Optional `npm ci`

The git-server hook runs **`npm ci`** before deploy. On the Jenkins agent, a full **`npm ci` runs root `postinstall` (Electron rebuild)** and often fails or is slow without a desktop/Electron toolchain. The pipeline exposes a parameter **`RUN_NPM_CI`**, which runs **`npm ci --ignore-scripts`** only when enabled — enough to validate the lockfile and install most deps without Electron rebuild.

Host **`npm ci` is not required** for `npm run deploy` itself: deploy uses Docker for builds; the helper script only needs **Node 22** for the small `node` invocation in `docker-full-deploy.sh`.

## First-time NVM on the agent

As the same user Jenkins uses:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# log in again or source ~/.nvm/nvm.sh
nvm install 22
```

Then run a pipeline build; `jenkins-with-node22.sh` will use that Node if none is on `PATH`.
