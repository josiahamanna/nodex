#!/usr/bin/env bash
# Bring up the Docker stack after reboot (no image build). Use after a successful `npm run deploy`.
#
# Intended for systemd (see deploy/systemd/nodex-docker-stack.service.example). Assumes images exist
# and matches the default `npm run deploy` layout: optional mongo-sync + nodex-sync-api + nodex-web-blue + nodex-gateway.
#
# Production: set JWT_SECRET in .env or EnvironmentFile= on the unit so sync-api auth persists
# across container recreates (this script does not generate one).
#
# Limitation: hosts that keep only green running with blue stopped may need a custom compose command;
# the gateway compose file depends on nodex-web-blue by default.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -f "${REPO_ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env"
  set +a
fi

# shellcheck disable=SC1091
source "${REPO_ROOT}/scripts/docker-local-mongo-env.sh"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$REPO_ROOT")}"
export NODEX_WPN_DEFAULT_OWNER="${NODEX_WPN_DEFAULT_OWNER:-jehu}"

mkdir -p dist/plugins
mkdir -p .nodex-docker-workspace

docker compose "${compose_pf[@]}" up -d --no-build --remove-orphans "${mongo_svc[@]}" nodex-sync-api nodex-web-blue nodex-gateway
docker compose "${compose_pf[@]}" up -d --no-build --remove-orphans --no-deps nodex-gateway
