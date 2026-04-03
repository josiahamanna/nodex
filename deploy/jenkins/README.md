# Jenkins release / deploy

The root [`Jenkinsfile`](../../Jenkinsfile) runs `npm run deploy -- --stop-old` from a clean checkout. That script drives Docker Compose and the UI blue/green flow ([`scripts/docker-full-deploy.sh`](../../scripts/docker-full-deploy.sh)).

## Agent checklist

Confirm the machine or container that runs the job has:

1. **Bash** — the pipeline uses `bash`; do not rely on `/bin/sh` (dash) with NVM.
2. **Node.js 22** — either on `PATH`, or **NVM** installed for the Jenkins user with `nvm install 22` run once. [`scripts/jenkins-with-node22.sh`](../../scripts/jenkins-with-node22.sh) picks system Node 22 first, otherwise loads `$NVM_DIR/nvm.sh` (default `$HOME/.nvm`). Override with `NVM_DIR` in the job environment if NVM lives elsewhere.
3. **Docker CLI and Compose v2** — same daemon that should run the stack; the `jenkins` user must be able to run `docker` and `docker compose` (group membership or equivalent socket access).
4. **Repository root as `WORKSPACE`** — the job must check out this repo so `package.json` and `scripts/` are at the top level of the workspace (use **Checkout** to the default workspace or set `subdir` consistently).

## Docker: `nodex-postgres` / `nodex-gateway` name already in use

Compose uses fixed `container_name` values (see [`docker-compose.yml`](../../docker-compose.yml)). Docker allows each name only once per daemon.

- **Stopped leftover** — [`scripts/docker-full-deploy.sh`](../../scripts/docker-full-deploy.sh) removes a **stopped** `nodex-postgres` before `compose up`; the **`nodex-pg-data` volume** keeps database files.
- **Wrong Compose project** — Compose labels each container with `com.docker.compose.project` (default: checkout directory basename, e.g. `nodex-studio`). If the [`Jenkinsfile`](../../Jenkinsfile) sets **`COMPOSE_PROJECT_NAME=nodex`** but old containers still belong to `nodex-studio`, Compose tries to **create** new containers and hits a name conflict. The deploy script **removes** postgres, gateway, API, and web slots whose project label **does not** match the current `COMPOSE_PROJECT_NAME`, then recreates them under the correct project (named volumes are unchanged; expect a short DB/API blip).
- **Local dev** — If you do not set `COMPOSE_PROJECT_NAME`, the script defaults it to the repo directory basename, matching Compose’s usual behavior.

## Why a naive `sh` + hard-coded NVM path fails

- Jenkins `sh` often runs **dash**, not bash; **NVM is not reliable** under dash.
- **`/var/lib/jenkins/.nvm` only works** if that is the agent user’s home and NVM was installed there. Prefer `$HOME/.nvm` or set `NVM_DIR` explicitly.

## Secrets and environment variables

[`scripts/docker-full-deploy.sh`](../../scripts/docker-full-deploy.sh) generates a random **`NODEX_AUTH_JWT_SECRET`** when unset, which **invalidates existing sessions** on each deploy. For production, bind a stable secret in Jenkins:

1. Add a **Secret text** credential (for example ID `nodex-auth-jwt-secret`).
2. In the `Jenkinsfile`, uncomment the `NODEX_*` credential lines inside `environment { }` and match the credential IDs to what you created.

Optional overrides (same as local deploy): `NODEX_PG_PASSWORD`, `NODEX_PG_DATABASE_URL`, `NODEX_WPN_DEFAULT_OWNER`, etc. Set them on the job or via an **Inject environment variables** / **Credentials** binding.

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
