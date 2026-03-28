# Modux Plugin System

## Overview

Modux is now a fully plugin-driven note-taking application. All note types are handled by plugins, and the note list is dynamically generated based on installed plugins.

## How It Works

### Dynamic Note List
- The sidebar note list is **automatically generated** from registered plugins
- When you import a plugin, a new note type appears in the list
- When you uninstall a plugin, its note type is removed from the list
- No hardcoded notes - everything is plugin-driven

### Plugin Structure

Each plugin must have:
```
plugin-name/
├── manifest.json
└── index.js
```

**manifest.json:**
```json
{
  "name": "plugin-name",
  "version": "1.0.0",
  "main": "index.js",
  "description": "Description of the plugin"
}
```

**index.js:**
```javascript
function activate(modux) {
  modux.ui.registerComponent('note-type', `
    // React component code using window.React
    const MyComponent = () => {
      return React.createElement('div', {}, 'Hello from plugin!');
    };
    return React.createElement(MyComponent);
  `);
  
  console.log('[Plugin: plugin-name] Activated');
}

function deactivate() {
  console.log('[Plugin: plugin-name] Deactivated');
}

module.exports = { activate, deactivate };
```

## Available Libraries

Plugins have access to these libraries via `window`:

- **window.React** - React library
- **window.TiptapReact** - Tiptap React hooks (useEditor, EditorContent)
- **window.TiptapStarterKit** - Tiptap StarterKit extension
- **window.MonacoReact** - Monaco Editor React component
- **window.Monaco** - Monaco Editor API

## Creating a Plugin ZIP

```bash
cd plugins/your-plugin-name
zip -r your-plugin-name.zip manifest.json index.js
```

## Importing a Plugin

1. Click **"Manage Plugins"** in the sidebar
2. Click **"Import Plugin from ZIP"**
3. Select your `.zip` file
4. Plugin installs and a new note appears automatically in the sidebar

## Uninstalling a Plugin

1. Open **Plugin Manager**
2. Click **"Uninstall"** next to the plugin
3. Confirm the action
4. The note type is removed from the sidebar automatically

## Built-in Plugins

Three plugins are included by default:

### 1. markdown-note
- Type: `markdown`
- Renders markdown with custom styling
- Supports headings, bold, italic, lists

### 2. tiptap-editor
- Type: `text`
- Rich text editor with toolbar
- Full WYSIWYG editing capabilities

### 3. monaco-editor
- Type: `code`
- Code editor with syntax highlighting
- Supports multiple languages

## Plugin Development Tips

1. **Use React.createElement** - JSX is not available, use React API directly
2. **Access note data** - The `note` object is available in your component code
3. **Handle errors** - Wrap your code in try-catch for better debugging
4. **Test locally** - Place your plugin in `plugins/` folder during development
5. **Create ZIP** - Only zip the manifest.json and index.js files

## Example: Simple Plugin

```javascript
// index.js
function activate(modux) {
  modux.ui.registerComponent('simple', `
    const React = window.React;
    
    const SimpleNote = () => {
      return React.createElement('div', {
        className: 'p-8'
      }, [
        React.createElement('h1', { 
          key: 'title',
          className: 'text-2xl font-bold mb-4' 
        }, note.title),
        React.createElement('p', {
          key: 'content',
          className: 'text-gray-700'
        }, note.content)
      ]);
    };
    
    return React.createElement(SimpleNote);
  `);
  
  console.log('[Plugin: simple] Activated');
}

module.exports = { activate };
```

## Architecture

```
User imports plugin.zip
    ↓
PluginLoader extracts to plugins/
    ↓
Plugin activate() called
    ↓
Component registered in Registry
    ↓
Note list automatically refreshed
    ↓
New note type appears in sidebar
```

## Notes

- Plugins are loaded on app startup from the `plugins/` directory
- The registry maintains all registered component types
- Each plugin can register one or more note types
- Sample content is generated for each note type
- Plugins can be hot-reloaded by restarting the app
