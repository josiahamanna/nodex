#!/bin/bash
# Create a zip per plugin (excludes node_modules and existing zips).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
count=0
for plugin_dir in "$SCRIPT_DIR"/*/; do
  [ -d "$plugin_dir" ] || continue
  plugin_name=$(basename "$plugin_dir")
  if [ ! -f "$plugin_dir/manifest.json" ]; then
    echo "Skipping $plugin_name: no manifest.json"
    continue
  fi
  echo "Processing: $plugin_name"
  (
    cd "$plugin_dir" || exit 1
    rm -f "${plugin_name}.zip"
    zip -qr "${plugin_name}.zip" . -x "*.zip" -x "node_modules/*" -x ".git/*"
  )
  echo "  ✓ Created ${plugin_name}.zip"
  ((count++)) || true
done
echo "Done! Created $count zip(s)."
