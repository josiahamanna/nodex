#!/usr/bin/env bash
# Build distributables via Electron Forge.
# Usage: ./build.sh linux|windows|mac|all
#
# Note: Producing Windows/macOS installers usually requires running that target on the
# respective OS (or a CI matrix). Linux hosts typically build Linux artifacts reliably.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

clean_forge() {
  npm run clean:forge
}

forge_make() {
  npx electron-forge make "$@"
}

usage() {
  echo "Usage: $0 {linux|windows|mac|all}" >&2
  exit 1
}

TARGET="${1:-}"
case "$TARGET" in
  linux)
    clean_forge
    forge_make \
      --platform=linux \
      --targets=@electron-forge/maker-deb,@forkprince/electron-forge-maker-appimage
    echo "Artifacts under: $ROOT/out/make"
    ;;
  windows|win)
    clean_forge
    forge_make --platform=win32
    echo "Artifacts under: $ROOT/out/make"
    ;;
  mac|darwin|macos)
    clean_forge
    forge_make --platform=darwin --targets=@electron-forge/maker-zip
    echo "Artifacts under: $ROOT/out/make"
    ;;
  all)
    clean_forge
    forge_make \
      --platform=linux \
      --targets=@electron-forge/maker-deb,@forkprince/electron-forge-maker-appimage
    clean_forge
    forge_make --platform=win32
    clean_forge
    forge_make --platform=darwin --targets=@electron-forge/maker-zip
    echo "Artifacts under: $ROOT/out/make"
    ;;
  -h|--help|help)
    echo "Build Nodex distributables."
    echo ""
    echo "  linux    — .deb (Debian) + AppImage"
    echo "  windows  — Squirrel (Windows installer)"
    echo "  mac      — .zip (darwin)"
    echo "  all      — linux, then windows, then mac (clean between each)"
    exit 0
    ;;
  *)
    usage
    ;;
esac
