#!/usr/bin/env bash
# Build @nodex/web, start nodex-sync-api + Next production server, run Playwright smoke tests.
# Requires Mongo at MONGODB_URI (default mongodb://127.0.0.1:27017).
#
# Ports (override if busy):
#   PORT / E2E_SYNC_API_PORT — sync-api (default 4010)
#   E2E_WEB_PORT — Next.js (default 3456; avoids clashing with dev on :3000)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017}"
export JWT_SECRET="${JWT_SECRET:-dev-only-nodex-sync-secret-min-32-chars!!}"
export PORT="${PORT:-${E2E_SYNC_API_PORT:-4010}}"
export HOST="${HOST:-127.0.0.1}"
WEB_PORT="${E2E_WEB_PORT:-3456}"

cleanup() {
  if [ -n "${WEB_PID:-}" ] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "${API_PID:-}" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

(
  cd apps/nodex-sync-api
  exec npx tsx src/server.ts
) &
API_PID=$!

for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    echo "sync-api exited before becoming healthy" >&2
    exit 1
  fi
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null; then
  echo "Timed out waiting for sync-api /health" >&2
  exit 1
fi

export NEXT_PUBLIC_NODEX_SYNC_API_URL="http://127.0.0.1:${PORT}"
export NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API=1
export NEXT_PUBLIC_NODEX_WEB_BACKEND=sync-only

npm run build -w @nodex/web

(
  cd apps/nodex-web
  exec env \
    NEXT_PUBLIC_NODEX_SYNC_API_URL="$NEXT_PUBLIC_NODEX_SYNC_API_URL" \
    NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API="$NEXT_PUBLIC_NODEX_WPN_USE_SYNC_API" \
    NEXT_PUBLIC_NODEX_WEB_BACKEND="$NEXT_PUBLIC_NODEX_WEB_BACKEND" \
    npx next start -p "$WEB_PORT" -H 0.0.0.0
) &
WEB_PID=$!

for _ in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:${WEB_PORT}/" >/dev/null; then
    break
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "Next.js server exited before becoming ready" >&2
    exit 1
  fi
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${WEB_PORT}/" >/dev/null; then
  echo "Timed out waiting for Next.js on :${WEB_PORT}" >&2
  exit 1
fi

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:${WEB_PORT}}"
npx playwright install chromium
npx playwright test -c e2e/playwright.config.ts
