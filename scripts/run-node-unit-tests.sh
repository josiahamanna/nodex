#!/usr/bin/env bash
# Run all repo-root unit tests under src/ with Node's test runner + strip-types.
# Excludes note-vfs-link-rewrite.test.ts: its imports omit .ts extensions and fail under
# Node's native resolver; that file is run via `tsx --test` from npm "test".
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mapfile -t files < <(find src -name '*.test.ts' ! -name 'note-vfs-link-rewrite.test.ts' | sort)
if [ "${#files[@]}" -eq 0 ]; then
  echo "No test files found under src/" >&2
  exit 1
fi
exec node --experimental-strip-types --test "${files[@]}"
