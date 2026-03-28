# Plugin Sources

This directory contains the **source code** for Modux plugins during development.

## Directory Structure

```
plugin-sources/          # Plugin development (this folder)
├── markdown-note/
├── monaco-editor/
├── tiptap-editor/
└── create-zips.sh      # Script to create distributable zips

~/.config/Electron/     # Runtime plugins (user data directory)
└── plugins/            # Where imported plugins are installed
    ├── markdown-note/
    ├── monaco-editor/
    └── tiptap-editor/
```

## Separation of Concerns

### `plugin-sources/` (Development)
- Contains plugin source code
- Used for development and editing
- Version controlled in git
- Run `./create-zips.sh` to create distributable zips

### `userData/plugins/` (Runtime)
- Contains installed plugins
- Managed by the Plugin Manager UI
- Plugins are imported from zip files
- Located in Electron's user data directory

## Workflow

### 1. **Develop Plugin**
Edit plugin code in `plugin-sources/your-plugin/`

### 2. **Create Distribution**
```bash
cd plugin-sources
./create-zips.sh
```

### 3. **Import Plugin**
- Open Modux app
- Click "Manage Plugins"
- Click "Import Plugin from ZIP"
- Select `plugin-sources/your-plugin/your-plugin.zip`

### 4. **Plugin Installed**
Plugin is extracted to `userData/plugins/your-plugin/` and activated

## Creating a New Plugin

1. Create folder in `plugin-sources/`:
```bash
mkdir plugin-sources/my-plugin
```

2. Create `manifest.json`:
```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "description": "My custom plugin"
}
```

3. Create `index.js`:
```javascript
function activate(modux) {
  modux.ui.registerComponent('my-type', `
    const React = window.React;
    // Your plugin code here
    return React.createElement('div', {}, 'Hello from my plugin!');
  `);
  console.log('[Plugin: my-plugin] Activated');
}

module.exports = { activate };
```

4. Create zip:
```bash
cd plugin-sources
./create-zips.sh
```

5. Import via Plugin Manager UI

## Available Plugins

- **markdown-note** - Markdown renderer with custom styling
- **monaco-editor** - Code editor with syntax highlighting  
- **tiptap-editor** - Rich text WYSIWYG editor

## Notes

- The runtime `plugins/` directory is automatically created in user data
- Plugins are loaded on app startup
- Changes to source code require re-creating zip and re-importing
- Old plugin versions should be uninstalled before importing new ones
