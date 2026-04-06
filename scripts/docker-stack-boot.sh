#!/usr/bin/env bash
# Bring up the WPN Docker stack after reboot (no image build). Use after a successful `npm run deploy`.
#
# Intended for systemd (see deploy/systemd/nodex-docker-stack.service.example). Assumes images exist
# and matches the default `npm run deploy` layout: postgres + nodex-api + nodex-web-blue + nodex-gateway.
#
# Production: set NODEX_AUTH_JWT_SECRET in .env or EnvironmentFile= on the unit so sessions persist
# across container recreates (this script does not generate one).
#
# Limitation: hosts that keep only green running with blue stopped may need a custom compose command;
# the gateway compose file depends on nodex-web-blue by default.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$REPO_ROOT")}"
export NODEX_PG_PASSWORD="${NODEX_PG_PASSWORD:-nodex}"
export NODEX_PG_DATABASE_URL="${NODEX_PG_DATABASE_URL:-postgresql://nodex:${NODEX_PG_PASSWORD}@postgres:5432/nodex}"
export NODEX_WPN_DEFAULT_OWNER="${NODEX_WPN_DEFAULT_OWNER:-jehu}"

mkdir -p dist/plugins
mkdir -p .nodex-docker-workspace

docker compose --profile wpn-pg up -d --no-build --remove-orphans postgres nodex-api nodex-web-blue nodex-gateway
docker compose --profile wpn-pg up -d --no-build --remove-orphans --no-deps nodex-gateway
