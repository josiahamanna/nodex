# Minimum POC Architecture for Nodex

## Goal

Validate the core concept: **Can plugins dynamically register and render custom note types without modifying the core system?**

---

## Success Criteria

1. Core app loads and displays a basic UI
2. A plugin can be loaded at runtime
3. Plugin can register a custom note type
4. Custom note type renders in the UI
5. Hot reload: changing plugin code updates UI without restart

---

## Minimal Scope

### What to Include

- **Electron app** with main + renderer process
- **Plugin loader** that reads plugin folders
- **Component registry** for note types
- **1 hardcoded note** in memory (no database yet)
- **1 plugin** that renders markdown notes
- **Basic UI shell** that displays the note

### What to Exclude

- Database (use in-memory array)
- Multiple notes / tree structure
- Note editing (read-only for now)
- IPC complexity (keep simple)
- Commands API
- Events API
- Panel system
- File system operations
- Authentication
- Settings

---

## Architecture

```
poc-Nodex/
├── main.js              # Electron main process
├── preload.js           # Bridge between main and renderer
├── renderer/
│   ├── index.html       # UI shell
│   ├── app.js           # Renderer logic
│   └── style.css        # Basic styling
├── core/
│   ├── plugin-loader.js # Load plugins from disk
│   └── registry.js      # Component registry
├── plugins/
│   └── markdown-note/
│       ├── manifest.json
│       └── index.js     # Plugin implementation
└── package.json
```

---

## Data Flow

```
1. Main process starts
2. Plugin loader scans plugins/ folder
3. Load manifest.json from each plugin
4. Execute plugin's index.js with context API
5. Plugin registers component via Nodex.ui.registerComponent()
6. Renderer requests note data
7. Core returns note with type="markdown"
8. Renderer looks up "markdown" in registry
9. Renderer mounts plugin component
10. Plugin component renders the note
```

---

## Core Components

### 1. Main Process (`main.js`)

**Responsibilities:**
- Create Electron window
- Initialize plugin loader
- Expose IPC handlers for:
  - `get-note` → returns hardcoded note
  - `get-component` → returns registered component code

**Pseudocode:**
```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const PluginLoader = require('./core/plugin-loader');
const registry = require('./core/registry');

let mainWindow;

app.on('ready', () => {
  // Load plugins
  const loader = new PluginLoader('./plugins');
  loader.loadAll(registry);
  
  // Create window
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  
  mainWindow.loadFile('renderer/index.html');
});

// IPC: Get note
ipcMain.handle('get-note', () => {
  return {
    id: '1',
    type: 'markdown',
    content: '# Hello World\n\nThis is a **markdown** note.'
  };
});

// IPC: Get component for type
ipcMain.handle('get-component', (event, type) => {
  return registry.getComponent(type);
});
```

---

### 2. Plugin Loader (`core/plugin-loader.js`)

**Responsibilities:**
- Scan plugins directory
- Read manifest.json
- Execute plugin's main file
- Provide context API to plugin

**Pseudocode:**
```javascript
const fs = require('fs');
const path = require('path');

class PluginLoader {
  constructor(pluginsDir) {
    this.pluginsDir = pluginsDir;
  }
  
  loadAll(registry) {
    const pluginFolders = fs.readdirSync(this.pluginsDir);
    
    for (const folder of pluginFolders) {
      const pluginPath = path.join(this.pluginsDir, folder);
      const manifestPath = path.join(pluginPath, 'manifest.json');
      
      if (!fs.existsSync(manifestPath)) continue;
      
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const mainFile = path.join(pluginPath, manifest.main);
      
      // Create context API
      const Nodex = {
        ui: {
          registerComponent: (type, componentCode) => {
            registry.register(type, componentCode);
          }
        }
      };
      
      // Load and execute plugin
      const plugin = require(mainFile);
      if (plugin.activate) {
        plugin.activate(Nodex);
      }
    }
  }
}

module.exports = PluginLoader;
```

---

### 3. Component Registry (`core/registry.js`)

**Responsibilities:**
- Store mapping of note type → component code
- Retrieve component by type

**Pseudocode:**
```javascript
class Registry {
  constructor() {
    this.components = new Map();
  }
  
  register(type, componentCode) {
    this.components.set(type, componentCode);
    console.log(`Registered component: ${type}`);
  }
  
  getComponent(type) {
    return this.components.get(type) || null;
  }
}

module.exports = new Registry();
```

---

### 4. Preload Script (`preload.js`)

**Responsibilities:**
- Expose safe IPC methods to renderer

**Code:**
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Nodex', {
  getNote: () => ipcRenderer.invoke('get-note'),
  getComponent: (type) => ipcRenderer.invoke('get-component', type)
});
```

---

### 5. Renderer (`renderer/app.js`)

**Responsibilities:**
- Fetch note from main process
- Get component for note type
- Render component dynamically

**Pseudocode:**
```javascript
async function loadNote() {
  // Get note data
  const note = await window.Nodex.getNote();
  
  // Get component for this note type
  const componentCode = await window.Nodex.getComponent(note.type);
  
  if (!componentCode) {
    document.getElementById('content').innerHTML = 
      `<p>No renderer for type: ${note.type}</p>`;
    return;
  }
  
  // Execute component code to get render function
  const renderFn = new Function('note', componentCode);
  
  // Render
  const html = renderFn(note);
  document.getElementById('content').innerHTML = html;
}

loadNote();
```

---

### 6. UI Shell (`renderer/index.html`)

**Minimal structure:**
```html
<!DOCTYPE html>
<html>
<head>
  <title>Nodex POC</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>Nodex POC</h1>
    </header>
    <main id="content">
      Loading...
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

---

### 7. Markdown Plugin (`plugins/markdown-note/manifest.json`)

```json
{
  "name": "markdown-note",
  "version": "1.0.0",
  "main": "index.js"
}
```

---

### 8. Markdown Plugin (`plugins/markdown-note/index.js`)

**Responsibilities:**
- Register markdown component
- Provide render function

**Code:**
```javascript
function activate(Nodex) {
  // Register component for "markdown" type
  Nodex.ui.registerComponent('markdown', `
    // This code runs in renderer context
    const marked = window.marked || simpleMarkdown;
    return marked ? marked(note.content) : note.content;
    
    function simpleMarkdown(text) {
      return text
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\n/gim, '<br>');
    }
  `);
}

function deactivate() {
  // Cleanup if needed
}

module.exports = { activate, deactivate };
```

---

## Implementation Steps

### Phase 1: Basic Electron App (1-2 hours)

1. Initialize npm project
2. Install electron
3. Create main.js with basic window
4. Create renderer/index.html with "Hello World"
5. Test: `npm start` shows window

### Phase 2: Hardcoded Note (30 min)

1. Add IPC handler in main.js that returns hardcoded note
2. Add preload.js to expose IPC
3. Update renderer/app.js to fetch and display note.content as plain text
4. Test: Note content appears in window

### Phase 3: Plugin Loader (1-2 hours)

1. Create core/plugin-loader.js
2. Create core/registry.js
3. Create plugins/markdown-note/ with manifest + index.js
4. Load plugin in main.js on startup
5. Test: Console logs show plugin registered

### Phase 4: Dynamic Rendering (1-2 hours)

1. Update IPC to expose `get-component`
2. Update renderer to fetch component code
3. Execute component code with `new Function()`
4. Render result to DOM
5. Test: Markdown renders as HTML

### Phase 5: Hot Reload (Optional, 1 hour)

1. Add file watcher in main.js for plugins/
2. On change, reload plugin and update registry
3. Emit event to renderer to re-render
4. Test: Edit plugin file, see changes without restart

---

## Testing Checklist

- [ ] App launches without errors
- [ ] Window displays UI shell
- [ ] Note content appears
- [ ] Markdown is rendered as HTML (not plain text)
- [ ] Console shows "Registered component: markdown"
- [ ] Changing plugin code and restarting shows changes
- [ ] (Optional) Hot reload works

---

## Key Validation Points

### Does this prove the concept?

**Yes, if:**
1. ✅ Plugin code is separate from core
2. ✅ Plugin registers component at runtime
3. ✅ Core doesn't know about markdown
4. ✅ Adding new note type = adding new plugin (no core changes)

**No, if:**
1. ❌ Core has hardcoded markdown logic
2. ❌ Plugin can't register without modifying core
3. ❌ Component registry doesn't work

---

## Next Steps After POC

If POC succeeds:

1. Add SQLite database
2. Add note CRUD operations
3. Add tree structure (parent/child)
4. Add multiple plugins (code, canvas, etc.)
5. Add panel system
6. Add commands API
7. Add events API
8. Add proper security (sandboxing)

---

## Estimated Time

- **Minimum viable POC**: 4-6 hours
- **With hot reload**: 6-8 hours
- **Polished demo**: 10-12 hours

---

## Risk Mitigation

### Risk: Plugin code execution is unsafe

**Solution:** For POC, accept the risk. For production, use VM2 or isolated context.

### Risk: Component code doesn't execute in renderer

**Solution:** Use `new Function()` carefully. Ensure no syntax errors in plugin code.

### Risk: IPC becomes complex

**Solution:** Keep it simple. Only 2 IPC calls needed for POC.

---

## File Size Estimate

- `main.js`: ~50 lines
- `preload.js`: ~10 lines
- `plugin-loader.js`: ~30 lines
- `registry.js`: ~15 lines
- `renderer/app.js`: ~30 lines
- `renderer/index.html`: ~20 lines
- `plugins/markdown-note/index.js`: ~25 lines

**Total: ~180 lines of code**

---

## Conclusion

This minimal POC focuses on **one thing**: proving that plugins can dynamically extend the system without core modifications.

Everything else (database, editing, tree structure, etc.) can be added incrementally after validating this core concept.

The architecture is intentionally simple to reduce implementation time while still demonstrating the plugin system's viability.
