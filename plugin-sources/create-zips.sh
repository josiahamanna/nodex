#!/bin/bash

# Script to create zip files for all plugins in the plugins directory
# Usage: ./create-zips.sh

echo "Creating zip files for all plugins..."

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Counter for created zips
count=0

# Loop through each directory in the plugins folder
for plugin_dir in "$SCRIPT_DIR"/*/; do
    # Skip if not a directory
    [ -d "$plugin_dir" ] || continue
    
    # Get the plugin name (directory name)
    plugin_name=$(basename "$plugin_dir")
    
    # Check if manifest.json exists
    if [ -f "$plugin_dir/manifest.json" ]; then
        echo "Processing: $plugin_name"
        
        # Change to plugin directory
        cd "$plugin_dir" || continue
        
        # Remove old zip if exists
        [ -f "${plugin_name}.zip" ] && rm "${plugin_name}.zip"
        
        # Create zip with manifest.json and index.js
        if [ -f "index.js" ]; then
            zip -q "${plugin_name}.zip" manifest.json index.js
            echo "  ✓ Created ${plugin_name}.zip"
            ((count++))
        else
            echo "  ✗ Skipped: index.js not found"
        fi
        
        # Return to plugins directory
        cd "$SCRIPT_DIR" || exit
    else
        echo "Skipping $plugin_name: no manifest.json found"
    fi
done

echo ""
echo "Done! Created $count plugin zip file(s)."
