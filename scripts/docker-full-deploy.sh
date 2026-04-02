#!/usr/bin/env bash
# Full stack + zero-downtime UI deploy (Postgres WPN, API, gateway, web).
#
# Usage:
#   npm run deploy
#   npm run deploy -- --stop-old
#
# What it does:
#   1. Ensures dist/plugins exists (compose bind mount).
#   2. Ensures ./.nodex-docker-workspace exists (default API workspace bind).
#   3. Brings up postgres (wpn-pg profile), nodex-api, nodex-web-blue, nodex-gateway with
#      NODEX_PG_DATABASE_URL defaulted for the compose network (WPN data in Postgres; default owner jehu).
#   4. Runs scripts/docker-web-deploy.sh to build the web image, blue/green swap, and prune dangling images.
#
# Bundled Documentation (Guides): docs/bundled-plugin-authoring/ is copied into the nodex-api image
# (Dockerfile) and NODEX_BUNDLED_DOCS_DIR points there. Each deploy rebuilds/restarts the API when
# sources change; startup runs workspace bootstrap, which upserts those markdown notes into the
# workspace SQLite under the bind mount (default ./.nodex-docker-workspace).
#
# Override URL or password via environment or a .env file in the repo root (compose loads .env).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

export NODEX_PG_PASSWORD="${NODEX_PG_PASSWORD:-nodex}"
export NODEX_PG_DATABASE_URL="${NODEX_PG_DATABASE_URL:-postgresql://nodex:${NODEX_PG_PASSWORD}@postgres:5432/nodex}"
export NODEX_WPN_DEFAULT_OWNER="${NODEX_WPN_DEFAULT_OWNER:-jehu}"

if [[ -z "${NODEX_AUTH_JWT_SECRET:-}" ]]; then
  NODEX_AUTH_JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))")"
  export NODEX_AUTH_JWT_SECRET
  echo "[nodex] Generated NODEX_AUTH_JWT_SECRET for this deploy (export it to persist sessions across restarts)."
fi

mkdir -p dist/plugins
mkdir -p .nodex-docker-workspace

# Orphan from an old compose service name (e.g. nodex-web) — safe to drop.
docker rm -f nodex-web 2>/dev/null || true

# Stopped nodex-web-blue / nodex-web-green still hold fixed container_name values; compose then
# errors with "already in use". Remove only slots that are not serving traffic: always remove if
# stopped; if running, remove only when not the active upstream in deploy/nginx-active-web.upstream.conf
# (same source the gateway uses). Never touches postgres, nodex-api, or nodex-gateway.
ACTIVE_FILE="${REPO_ROOT}/deploy/nginx-active-web.upstream.conf"
active_line=""
if [[ -f "$ACTIVE_FILE" ]]; then
  active_line="$(grep -oE 'nodex-web-(blue|green)' "$ACTIVE_FILE" | head -1 || true)"
fi

remove_stale_web_slot() {
  local name="$1"
  if ! docker container inspect "$name" &>/dev/null; then
    return 0
  fi
  local running
  running="$(docker container inspect -f '{{.State.Running}}' "$name" 2>/dev/null || echo false)"
  if [[ "$running" != "true" ]]; then
    echo "[nodex] Removing stopped ${name} (frees fixed container name for compose)."
    docker rm -f "$name" >/dev/null 2>&1 || true
    return 0
  fi
  if [[ -n "$active_line" && "$name" != "$active_line" ]]; then
    echo "[nodex] Removing inactive ${name} (not in ${ACTIVE_FILE}; live UI stays on ${active_line})."
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}

remove_stale_web_slot nodex-web-blue
remove_stale_web_slot nodex-web-green

# UI blue/green swap uses `docker run`, so slots lose compose labels. Compose then tries to
# create the same container_name and hits "already in use". Drop only non-compose slots.
remove_docker_run_web_slot() {
  local name="$1"
  if ! docker container inspect "$name" &>/dev/null; then
    return 0
  fi
  # Never remove the active UI slot — that would cause avoidable downtime.
  if [[ -n "$active_line" && "$name" == "$active_line" ]]; then
    return 0
  fi
  local proj
  proj="$(docker container inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
  if [[ -z "$proj" ]]; then
    echo "[nodex] Removing ${name} (not compose-managed; frees fixed name for compose)."
    docker rm -f "$name" >/dev/null 2>&1 || true
  fi
}
remove_docker_run_web_slot nodex-web-blue
remove_docker_run_web_slot nodex-web-green

echo "[nodex] Starting Postgres + API + web (blue) + gateway (profile wpn-pg)..."
active_is_docker_run=false
if [[ -n "$active_line" ]]; then
  active_proj="$(docker container inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$active_line" 2>/dev/null || true)"
  if [[ -z "$active_proj" ]]; then
    active_is_docker_run=true
  fi
fi

compose_up() {
  if [[ "$active_is_docker_run" == "true" ]]; then
    # Avoid pulling in nodex-web-blue via depends_on (would conflict with an active docker-run slot).
    docker compose --profile wpn-pg up -d --build --remove-orphans postgres nodex-api
    docker compose --profile wpn-pg up -d --build --remove-orphans --no-deps nodex-gateway
  else
    docker compose --profile wpn-pg up -d --build --remove-orphans postgres nodex-api nodex-web-blue nodex-gateway
  fi
}

if ! compose_up; then
  echo "[nodex] Compose failed — clearing stale web slots again and retrying once..."
  remove_stale_web_slot nodex-web-blue
  remove_stale_web_slot nodex-web-green
  remove_docker_run_web_slot nodex-web-blue
  remove_docker_run_web_slot nodex-web-green
  compose_up
fi

echo "[nodex] Waiting for nodex-gateway to be running..."
for _ in $(seq 1 60); do
  if docker container inspect nodex-gateway &>/dev/null; then
    running="$(docker container inspect -f '{{.State.Running}}' nodex-gateway 2>/dev/null || echo false)"
    if [[ "$running" == "true" ]]; then
      break
    fi
  fi
  sleep 2
done

if [[ "$(docker container inspect -f '{{.State.Running}}' nodex-gateway 2>/dev/null || echo false)" != "true" ]]; then
  echo "Error: nodex-gateway did not become running. Check: docker compose logs" >&2
  exit 1
fi

echo "[nodex] Gateway is up. Running UI blue/green deploy..."
exec bash "${REPO_ROOT}/scripts/docker-web-deploy.sh" "$@"
