#!/usr/bin/env bash
# Build and deploy the UI with a blue/green swap (local zero-downtime UI deploy).
#
# Usage:
#   npm run deploy
#   npm run deploy -- --stop-old
#
# What it does:
#   - Detects current active color from deploy/nginx-active-web.upstream.conf
#   - Builds the web image (Dockerfile.web -> nodex-web:local)
#   - Recreates the *inactive* color container on the nodex_default network
#   - Waits until the UI responds on :3000 (HTTP GET to 127.0.0.1 inside the web container via
#     docker exec — avoids cross-container DNS/IPv6 issues; no Docker HEALTHCHECK on docker-run
#     slots so dockerd does not spam exec errors if the app exits)
#   - Switches nginx upstream and reloads the gateway
#
# Notes:
#   - This is zero-downtime for the UI tier: old stays live until new is healthy.
#   - It does not attempt blue/green for nodex-api (SQLite mount is not replica-safe).
#   - After a successful switch, `docker image prune -f` removes untagged parents from rebuilds.
#   - With --stop-old, the inactive container is removed (not only stopped) so old image layers can be pruned.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACTIVE_FILE="${REPO_ROOT}/deploy/nginx-active-web.upstream.conf"
GATEWAY="${NODEX_GATEWAY_CONTAINER:-nodex-gateway}"
NETWORK="${NODEX_DOCKER_NETWORK:-nodex_default}"
IMAGE="${NODEX_WEB_IMAGE:-nodex-web:local}"

STOP_OLD=false
for arg in "$@"; do
  case "$arg" in
    --stop-old) STOP_OLD=true ;;
    *)
      echo "Usage: $0 [--stop-old]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ACTIVE_FILE" ]]; then
  echo "Error: missing ${ACTIVE_FILE}" >&2
  exit 1
fi

if ! docker container inspect "$GATEWAY" &>/dev/null; then
  echo "Error: container '$GATEWAY' does not exist." >&2
  echo "Start the stack first:" >&2
  echo "  npm run deploy                    # Postgres WPN + API + gateway + UI" >&2
  echo "  npm run docker:api:up:detached   # compose only (set NODEX_HOST_PROJECT if needed)" >&2
  exit 1
fi

if [[ "$(docker container inspect -f '{{.State.Running}}' "$GATEWAY" 2>/dev/null)" != "true" ]]; then
  echo "Error: container '$GATEWAY' is not running. Start it with: docker compose up -d nodex-gateway" >&2
  exit 1
fi

if ! docker network inspect "$NETWORK" &>/dev/null; then
  echo "Error: docker network '$NETWORK' not found." >&2
  echo "Bring the stack up once so the compose network exists: npm run docker:api:up:detached" >&2
  exit 1
fi

line="$(grep -oE 'nodex-web-(blue|green)' "$ACTIVE_FILE" | head -1 || true)"
case "$line" in
  nodex-web-blue) current="blue" ;;
  nodex-web-green) current="green" ;;
  *)
    echo "Error: could not detect active color from ${ACTIVE_FILE} (expected nodex-web-blue or nodex-web-green)." >&2
    exit 1
    ;;
esac

if [[ "$current" == "blue" ]]; then
  next="green"
else
  next="blue"
fi

echo "[nodex] Deploying UI: ${current} -> ${next}"

echo "[nodex] Building web image (${IMAGE})..."
(cd "$REPO_ROOT" && docker build -t "$IMAGE" -f Dockerfile.web .)

target_container="nodex-web-${next}"
old_container="nodex-web-${current}"

if docker container inspect "$target_container" &>/dev/null; then
  echo "[nodex] Removing existing ${target_container}..."
  docker rm -f "$target_container" >/dev/null
fi

echo "[nodex] Starting ${target_container} on network ${NETWORK}..."
# No --health-* here: Docker would keep exec'ing into the container; if the app exits, dockerd
# logs "container ... is not running" and some CI setups surface that as a false-looking failure.
if ! docker run -d \
  --name "$target_container" \
  --network "$NETWORK" \
  -e NODE_ENV=production \
  "$IMAGE" >/dev/null; then
  echo "[nodex] docker run failed for ${target_container}." >&2
  exit 1
fi

sleep 2
state="$(docker container inspect -f '{{.State.Status}}' "$target_container" 2>/dev/null || echo missing)"
if [[ "$state" == "exited" || "$state" == "dead" ]]; then
  echo "[nodex] ${target_container} exited immediately (status=${state}). Container logs:" >&2
  docker logs --tail 200 "$target_container" 2>&1 || true
  exit 1
fi

echo "[nodex] Waiting for ${target_container} to respond on :3000 (localhost inside container)..."
healthy=false
for _ in $(seq 1 90); do
  if ! docker container inspect "$target_container" &>/dev/null; then
    echo "[nodex] ${target_container} no longer exists." >&2
    exit 1
  fi
  state="$(docker container inspect -f '{{.State.Status}}' "$target_container" 2>/dev/null || echo missing)"
  if [[ "$state" == "exited" || "$state" == "dead" ]]; then
    echo "[nodex] ${target_container} stopped while waiting (status=${state}). Container logs:" >&2
    docker logs --tail 200 "$target_container" 2>&1 || true
    exit 1
  fi
  if [[ "$state" != "running" ]]; then
    sleep 2
    continue
  fi
  # Probes 127.0.0.1 from inside the web container. HTTP from nodex-api to the container hostname
  # often fails (embedded DNS / IPv6) even when Next is bound to 0.0.0.0:3000.
  if docker exec "$target_container" node -e 'const http=require("http");const r=http.get("http://127.0.0.1:3000/",(res)=>{res.resume();res.on("end",()=>process.exit(res.statusCode>=200&&res.statusCode<500?0:1));});r.on("error",()=>process.exit(1));r.setTimeout(8000,()=>{r.destroy();process.exit(1);});' &>/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != "true" ]]; then
  state="$(docker container inspect -f '{{.State.Status}}' "$target_container" 2>/dev/null || echo ?)"
  echo "[nodex] Timed out waiting for ${target_container} on :3000 (state=${state}). Recent logs:" >&2
  docker logs --tail 200 "$target_container" 2>&1 || true
  exit 1
fi

cat >"$ACTIVE_FILE" <<EOF
# Full upstream block for UI — managed by scripts/docker-web-deploy.sh
upstream nodex_web {
    server ${target_container}:3000;
}
EOF

docker exec "$GATEWAY" nginx -t >/dev/null
docker exec "$GATEWAY" nginx -s reload

echo "[nodex] Switched UI: ${current} -> ${next}"

if [[ "$STOP_OLD" == "true" ]]; then
  echo "[nodex] Removing ${old_container} (--stop-old)..."
  docker rm -f "$old_container" >/dev/null 2>&1 || true
fi

# Same tag after rebuild leaves the prior image untagged; prune drops it once no container references it.
docker image prune -f
