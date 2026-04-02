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
#   4. Runs scripts/docker-web-deploy.sh to build the web image and blue/green swap.
#
# Override URL or password via environment or a .env file in the repo root (compose loads .env).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

export NODEX_PG_PASSWORD="${NODEX_PG_PASSWORD:-nodex}"
export NODEX_PG_DATABASE_URL="${NODEX_PG_DATABASE_URL:-postgresql://nodex:${NODEX_PG_PASSWORD}@postgres:5432/nodex}"
export NODEX_WPN_DEFAULT_OWNER="${NODEX_WPN_DEFAULT_OWNER:-jehu}"

mkdir -p dist/plugins
mkdir -p .nodex-docker-workspace

# Orphan from an old compose service name (e.g. nodex-web) — safe to drop.
docker rm -f nodex-web 2>/dev/null || true

echo "[nodex] Starting Postgres + API + web (blue) + gateway (profile wpn-pg)..."
if ! docker compose --profile wpn-pg up -d --build --remove-orphans postgres nodex-api nodex-web-blue nodex-gateway; then
  echo "[nodex] Compose failed (often: container name already in use). Removing web containers and retrying once..."
  docker rm -f nodex-web-blue nodex-web-green 2>/dev/null || true
  docker compose --profile wpn-pg up -d --build --remove-orphans postgres nodex-api nodex-web-blue nodex-gateway
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
