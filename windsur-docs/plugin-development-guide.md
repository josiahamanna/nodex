# Modux Plugin Development Guide

## Table of Contents

1. [Overview](#overview)
2. [Plugin Structure](#plugin-structure)
3. [File Organization](#file-organization)
4. [Manifest Specification](#manifest-specification)
5. [Backend API (main.js)](#backend-api-mainjs)
6. [Frontend API (index.js)](#frontend-api-indexjs)
7. [State Persistence](#state-persistence)
8. [Communication Pattern](#communication-pattern)
9. [Security Guidelines](#security-guidelines)
10. [Complete Examples](#complete-examples)
11. [Testing & Debugging](#testing--debugging)
12. [Publishing Plugins](#publishing-plugins)

---

## Overview

Modux plugins are modular extensions that add custom note renderers, editors, and functionality to the application. Plugins follow a **secure-by-design** architecture inspired by VS Code and Trilium, with clear separation between backend (Node.js) and frontend (browser) code.

### Key Principles

- ✅ **No hardcoded UI strings** - UI defined in separate HTML files
- ✅ **Sandboxed execution** - Backend runs in separate Node.js processes, frontend in iframes
- ✅ **State persistence** - Both per-note and global state support
- ✅ **Secure communication** - Structured message passing via plugin loader bridge
- ✅ **Graceful degradation** - Plugins fail safely without crashing the app

---

## Plugin Structure

### Required File Structure

```
my-plugin/
├── manifest.json          # Plugin metadata (REQUIRED)
├── main.js               # Backend logic - Node.js (REQUIRED)
├── index.html            # UI structure (REQUIRED for UI plugins)
├── index.js              # Frontend logic (REQUIRED for UI plugins)
├── style.css             # Styles (OPTIONAL)
└── assets/               # Images, fonts, etc. (OPTIONAL)
    ├── icon.png
    └── ...
```

### Plugin Types

1. **UI Plugin** - Renders custom note types (requires all files)
2. **Backend Plugin** - Background processing only (requires manifest.json + main.js)
3. **Hybrid Plugin** - Both UI and backend capabilities (requires all files)

---

## File Organization

### manifest.json (REQUIRED)

Declares plugin metadata, capabilities, and entry points.

```json
{
  "name": "markdown-renderer",
  "version": "1.0.0",
  "displayName": "Markdown Renderer",
  "description": "Rich markdown editor with live preview",
  "author": "Your Name",
  "license": "MIT",
  
  "type": "ui",
  "main": "main.js",
  "ui": "index.html",
  
  "noteTypes": ["markdown", "md"],
  
  "permissions": [
    "storage.read",
    "storage.write"
  ],
  
  "activationEvents": [
    "onNoteType:markdown"
  ],
  
  "icon": "assets/icon.png"
}
```

### main.js (REQUIRED)

Backend logic that runs in a separate sandboxed Node.js process.

```javascript
/**
 * Plugin activation function
 * @param {PluginContext} context - Plugin lifecycle context
 * @param {ModuxBackendAPI} api - Backend API
 */
function activate(context, api) {
  // Register note renderer
  const disposable = api.registerNoteRenderer('markdown', {
    htmlFile: 'index.html',
    
    // Optional: preprocess note data before sending to UI
    preprocess: async (note) => {
      return {
        ...note,
        metadata: {
          wordCount: note.content.split(/\s+/).length,
          processedAt: Date.now()
        }
      };
    }
  });
  
  // Add to subscriptions for cleanup
  context.subscriptions.push(disposable);
  
  // Listen for backend events
  api.events.on('note:saved', async (note) => {
    if (note.type === 'markdown') {
      // Perform backend processing
      await api.db.update('notes', note.id, {
        lastProcessed: Date.now()
      });
    }
  });
}

/**
 * Plugin deactivation function
 */
function deactivate() {
  // Cleanup resources
}

module.exports = { activate, deactivate };
```

### index.html (REQUIRED for UI plugins)

UI structure loaded into sandboxed iframe.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Renderer</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="toolbar">
    <button data-action="bold">Bold</button>
    <button data-action="italic">Italic</button>
    <button data-action="preview">Preview</button>
  </div>
  
  <div id="editor-container">
    <textarea id="editor" placeholder="Start typing..."></textarea>
    <div id="preview" style="display: none;"></div>
  </div>
  
  <!-- Load frontend logic -->
  <script src="index.js"></script>
</body>
</html>
```

### index.js (REQUIRED for UI plugins)

Frontend logic that runs in the sandboxed iframe.

```javascript
(function() {
  'use strict';
  
  // DOM elements
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const toolbar = document.getElementById('toolbar');
  
  // Plugin state
  let state = {
    noteId: null,
    content: '',
    cursorPosition: 0,
    scrollPosition: 0,
    isPreviewMode: false
  };
  
  // Initialize plugin
  function init() {
    setupEventListeners();
    
    // Notify parent that plugin is ready
    modux.postMessage({ type: 'ready' });
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Editor input
    editor.addEventListener('input', handleInput);
    editor.addEventListener('scroll', handleScroll);
    
    // Toolbar actions
    toolbar.addEventListener('click', handleToolbarClick);
    
    // Listen for messages from parent
    modux.onMessage = handleMessage;
  }
  
  // Handle editor input
  function handleInput() {
    state.content = editor.value;
    state.cursorPosition = editor.selectionStart;
    
    // Notify parent of content change
    modux.postMessage({
      type: 'contentChanged',
      content: state.content
    });
    
    // Update preview if in preview mode
    if (state.isPreviewMode) {
      updatePreview();
    }
  }
  
  // Handle scroll
  function handleScroll() {
    state.scrollPosition = editor.scrollTop;
  }
  
  // Handle toolbar clicks
  function handleToolbarClick(e) {
    const button = e.target.closest('button');
    if (!button) return;
    
    const action = button.dataset.action;
    
    switch (action) {
      case 'bold':
        insertMarkdown('**', '**');
        break;
      case 'italic':
        insertMarkdown('*', '*');
        break;
      case 'preview':
        togglePreview();
        break;
    }
  }
  
  // Insert markdown syntax
  function insertMarkdown(before, after) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.substring(start, end);
    
    const newText = text.substring(0, start) + 
                    before + selectedText + after + 
                    text.substring(end);
    
    editor.value = newText;
    editor.focus();
    editor.setSelectionRange(
      start + before.length,
      end + before.length
    );
    
    handleInput();
  }
  
  // Toggle preview mode
  function togglePreview() {
    state.isPreviewMode = !state.isPreviewMode;
    
    if (state.isPreviewMode) {
      editor.style.display = 'none';
      preview.style.display = 'block';
      updatePreview();
    } else {
      editor.style.display = 'block';
      preview.style.display = 'none';
    }
  }
  
  // Update preview
  function updatePreview() {
    // Request backend to render markdown
    modux.postMessage({
      type: 'renderMarkdown',
      content: state.content
    });
  }
  
  // Handle messages from parent
  function handleMessage(message) {
    switch (message.type) {
      case 'render':
        renderNote(message.payload);
        break;
        
      case 'restoreState':
        restoreState(message.payload);
        break;
        
      case 'saveState':
        saveState();
        break;
        
      case 'markdownRendered':
        preview.innerHTML = message.payload.html;
        break;
    }
  }
  
  // Render note
  function renderNote(note) {
    state.noteId = note.id;
    state.content = note.content;
    editor.value = note.content;
    
    // Reset UI state
    state.cursorPosition = 0;
    state.scrollPosition = 0;
    state.isPreviewMode = false;
    editor.style.display = 'block';
    preview.style.display = 'none';
  }
  
  // Restore state
  function restoreState(savedState) {
    if (!savedState) return;
    
    state = { ...state, ...savedState };
    editor.value = state.content;
    editor.scrollTop = state.scrollPosition;
    
    // Restore cursor position
    editor.focus();
    editor.setSelectionRange(
      state.cursorPosition,
      state.cursorPosition
    );
    
    // Restore preview mode
    if (state.isPreviewMode) {
      editor.style.display = 'none';
      preview.style.display = 'block';
      updatePreview();
    }
  }
  
  // Save state
  function saveState() {
    modux.postMessage({
      type: 'stateSnapshot',
      state: {
        noteId: state.noteId,
        content: state.content,
        cursorPosition: editor.selectionStart,
        scrollPosition: editor.scrollTop,
        isPreviewMode: state.isPreviewMode
      }
    });
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

---

## Manifest Specification

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique plugin identifier (lowercase, no spaces) |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `type` | string | Plugin type: "ui", "backend", or "hybrid" |
| `main` | string | Path to main.js file |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | Human-readable name |
| `description` | string | Plugin description |
| `author` | string | Author name |
| `license` | string | License type (e.g., "MIT") |
| `ui` | string | Path to index.html (required for UI plugins) |
| `noteTypes` | string[] | Note types this plugin handles |
| `permissions` | string[] | Required permissions |
| `activationEvents` | string[] | When to activate plugin |
| `icon` | string | Path to plugin icon |

### Permission Types

```typescript
type Permission =
  | 'storage.read'        // Read plugin storage
  | 'storage.write'       // Write plugin storage
  | 'db.read'            // Read database (own data only)
  | 'db.write'           // Write database (own data only)
  | 'fs.read'            // Read files (sandboxed)
  | 'fs.write'           // Write files (sandboxed)
  | 'network.http'       // Make HTTP requests
  | 'ui.panel'           // Create UI panels
  | 'ui.toolbar';        // Add toolbar buttons
```

### Activation Events

```typescript
type ActivationEvent =
  | 'onStartup'                    // When app starts
  | 'onNoteType:${noteType}'       // When note type is opened
  | 'onCommand:${commandId}'       // When command is executed
  | 'onEvent:${eventName}';        // When event is emitted
```

---

## Backend API (main.js)

The backend API runs in a separate sandboxed Node.js process and provides access to Node.js capabilities.

### PluginContext

```typescript
interface PluginContext {
  // Plugin metadata
  manifest: PluginManifest;
  
  // Subscriptions for cleanup
  subscriptions: Disposable[];
  
  // Plugin-specific storage directory
  storageDir: string;
  
  // Logger
  logger: Logger;
}
```

### ModuxBackendAPI

```typescript
interface ModuxBackendAPI {
  // Note renderer registration
  registerNoteRenderer(
    noteType: string,
    options: RendererOptions
  ): Disposable;
  
  // Database access (scoped to plugin data)
  db: {
    query(sql: string, params?: any[]): Promise<any[]>;
    insert(table: string, data: object): Promise<string>;
    update(table: string, id: string, data: object): Promise<void>;
    delete(table: string, id: string): Promise<void>;
  };
  
  // File system access (sandboxed)
  fs: {
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer | string): Promise<void>;
    exists(path: string): Promise<boolean>;
    readdir(path: string): Promise<string[]>;
  };
  
  // Event system
  events: {
    on(event: string, callback: Function): Disposable;
    emit(event: string, ...args: any[]): void;
  };
  
  // Storage (persistent key-value)
  storage: {
    // Global plugin storage
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
    
    // Per-note storage
    getForNote<T>(noteId: string, key: string): Promise<T | undefined>;
    setForNote<T>(noteId: string, key: string, value: T): Promise<void>;
    deleteForNote(noteId: string, key: string): Promise<void>;
  };
  
  // HTTP requests (if permission granted)
  http: {
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, data: any, options?: RequestOptions): Promise<Response>;
  };
  
  // Send message to frontend
  sendToFrontend(noteId: string, message: any): Promise<void>;
}
```

### RendererOptions

```typescript
interface RendererOptions {
  // Path to HTML file (relative to plugin directory)
  htmlFile: string;
  
  // Optional: preprocess note before sending to UI
  preprocess?: (note: Note) => Promise<Note> | Note;
  
  // Optional: handle messages from frontend
  onMessage?: (noteId: string, message: any) => Promise<any> | any;
}
```

### Example: Database Access

```javascript
function activate(context, api) {
  // Create plugin-specific table
  await api.db.query(`
    CREATE TABLE IF NOT EXISTS plugin_${context.manifest.name}_data (
      id TEXT PRIMARY KEY,
      note_id TEXT,
      data TEXT,
      created_at INTEGER
    )
  `);
  
  // Insert data
  await api.db.insert(`plugin_${context.manifest.name}_data`, {
    id: 'unique-id',
    note_id: 'note-123',
    data: JSON.stringify({ foo: 'bar' }),
    created_at: Date.now()
  });
  
  // Query data
  const results = await api.db.query(
    `SELECT * FROM plugin_${context.manifest.name}_data WHERE note_id = ?`,
    ['note-123']
  );
}
```

### Example: File System Access

```javascript
function activate(context, api) {
  // Read file from plugin directory
  const content = await api.fs.readFile('templates/default.md');
  
  // Write to plugin storage directory
  await api.fs.writeFile(
    context.storageDir + '/cache.json',
    JSON.stringify({ cached: true })
  );
  
  // Check if file exists
  const exists = await api.fs.exists(context.storageDir + '/cache.json');
}
```

---

## Frontend API (index.js)

The frontend API runs in a sandboxed iframe and provides UI capabilities.

### Global `modux` Object

```typescript
interface ModuxFrontendAPI {
  // Send message to parent (plugin loader)
  postMessage(message: any): void;
  
  // Receive messages from parent
  onMessage: ((message: any) => void) | null;
  
  // Storage (synced with backend)
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
  
  // UI utilities
  ui: {
    showNotification(message: string, type?: 'info' | 'warning' | 'error'): void;
    showInputBox(options: InputBoxOptions): Promise<string | undefined>;
  };
}
```

### Message Types

#### From Parent to Plugin

```typescript
// Render a note
{
  type: 'render',
  payload: {
    id: string;
    type: string;
    content: string;
    metadata: object;
  }
}

// Restore saved state
{
  type: 'restoreState',
  payload: object  // Previously saved state
}

// Request state snapshot
{
  type: 'saveState'
}

// Update note content
{
  type: 'update',
  payload: {
    id: string;
    content: string;
  }
}

// Custom message from backend
{
  type: 'custom',
  payload: any
}
```

#### From Plugin to Parent

```typescript
// Plugin is ready
{
  type: 'ready'
}

// Content changed
{
  type: 'contentChanged',
  content: string
}

// State snapshot
{
  type: 'stateSnapshot',
  state: object
}

// Request backend processing
{
  type: 'requestBackend',
  action: string,
  payload: any
}

// Show notification
{
  type: 'showNotification',
  message: string,
  level: 'info' | 'warning' | 'error'
}
```

---

## State Persistence

Modux supports **two types of state persistence**:

### 1. Per-Note State (Recommended for Editors)

State is saved per note, so each note remembers its own cursor position, scroll, etc.

```javascript
// Frontend (index.js)
function saveState() {
  modux.postMessage({
    type: 'stateSnapshot',
    state: {
      noteId: currentNoteId,
      cursorPosition: editor.selectionStart,
      scrollPosition: editor.scrollTop,
      customData: { foo: 'bar' }
    }
  });
}

// When switching back to this note, state is restored
modux.onMessage = (message) => {
  if (message.type === 'restoreState') {
    const state = message.payload;
    editor.scrollTop = state.scrollPosition;
    editor.setSelectionRange(state.cursorPosition, state.cursorPosition);
  }
};
```

### 2. Global Plugin State (For Settings/Preferences)

State is shared across all notes.

```javascript
// Backend (main.js)
async function activate(context, api) {
  // Save global setting
  await api.storage.set('theme', 'dark');
  
  // Load global setting
  const theme = await api.storage.get('theme');
}

// Frontend (index.js)
async function loadSettings() {
  const theme = await modux.storage.get('theme');
  applyTheme(theme);
}
```

### State Persistence Flow

```
1. User switches away from Note A
   ↓
2. Plugin receives 'saveState' message
   ↓
3. Plugin sends 'stateSnapshot' with current state
   ↓
4. System stores state: { noteId: 'A', state: {...} }
   ↓
5. User switches back to Note A
   ↓
6. System sends 'restoreState' with saved state
   ↓
7. Plugin restores UI to previous state
```

---

## Communication Pattern

Following VS Code and Trilium best practices, Modux uses a **bridge pattern** for secure communication.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Plugin Process (Separate Node.js Process)               │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Plugin Backend (main.js)                         │  │
│  │  - Database access (via IPC)                     │  │
│  │  - File system access (sandboxed)                │  │
│  │  - Network requests (if permitted)               │  │
│  └──────────────────┬───────────────────────────────┘  │
└────────────────────┼─────────────────────────────────────┘
                     │ IPC (child_process)
┌────────────────────▼─────────────────────────────────────┐
│ Main Process (Node.js)                                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Plugin Loader (Bridge)                           │  │
│  │  - Process management                             │  │
│  │  - Message routing                                │  │
│  │  - Permission checking                            │  │
│  │  - State management                               │  │
│  └──────────────────┬───────────────────────────────┘  │
└────────────────────┼─────────────────────────────────────┘
                     │ IPC
┌────────────────────▼─────────────────────────────────────┐
│ Renderer Process (Chromium)                              │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Sandboxed iframe (Plugin Frontend - index.js)    │   │
│  │  - UI rendering                                   │   │
│  │  - User interaction                               │   │
│  │  - State visualization                            │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Message Flow Example

**Scenario**: User types in editor, plugin needs to save to database

```javascript
// 1. Frontend detects input
// index.js
editor.addEventListener('input', () => {
  modux.postMessage({
    type: 'requestBackend',
    action: 'saveContent',
    payload: { content: editor.value }
  });
});

// 2. Plugin Loader receives message, routes to backend
// (handled internally by system)

// 3. Backend processes request
// main.js
function activate(context, api) {
  api.registerNoteRenderer('markdown', {
    htmlFile: 'index.html',
    
    onMessage: async (noteId, message) => {
      if (message.action === 'saveContent') {
        // Save to database
        await api.db.update('notes', noteId, {
          content: message.payload.content,
          updated_at: Date.now()
        });
        
        // Send confirmation back to frontend
        return { success: true };
      }
    }
  });
}

// 4. Response sent back to frontend
// index.js
modux.onMessage = (message) => {
  if (message.type === 'backendResponse') {
    if (message.payload.success) {
      showNotification('Saved!');
    }
  }
};
```

### Security Benefits

✅ **No direct access** - Frontend cannot directly call Node.js APIs  
✅ **Permission checking** - Bridge validates permissions before routing  
✅ **Message validation** - All messages are validated and sanitized  
✅ **Rate limiting** - Prevents message flooding  
✅ **Audit logging** - All plugin actions are logged  

---

## Security Guidelines

### Content Security Policy (CSP)

Plugin iframes run with strict CSP:

```
default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
img-src data: blob:;
connect-src 'none';
```

**Implications**:
- ❌ Cannot load external scripts
- ❌ Cannot make fetch/XHR requests directly
- ✅ Can use inline scripts and styles
- ✅ Can display images from data URLs

### Sandboxing

**Backend (main.js)**:
- Runs in separate isolated Node.js process
- Complete process isolation (separate V8 instance)
- Limited Node.js API surface via IPC bridge
- File system access restricted to plugin directory
- Database access scoped to plugin tables (via IPC)
- Network requests require permission
- Resource limits enforced at OS level

**Frontend (index.js)**:
- Runs in sandboxed iframe
- No access to parent DOM
- Communication via postMessage only
- No access to Node.js APIs

### Best Practices

1. **Validate all inputs**
   ```javascript
   function handleMessage(message) {
     if (!message || typeof message !== 'object') return;
     if (!message.type || typeof message.type !== 'string') return;
     // Process message
   }
   ```

2. **Sanitize HTML output**
   ```javascript
   function renderContent(content) {
     // Use DOMPurify or similar
     const clean = sanitizeHTML(content);
     element.innerHTML = clean;
   }
   ```

3. **Avoid storing sensitive data**
   ```javascript
   // ❌ Don't do this
   await api.storage.set('apiKey', 'secret-key');
   
   // ✅ Do this
   // Ask user to configure in app settings
   ```

4. **Handle errors gracefully**
   ```javascript
   try {
     await api.db.query('SELECT * FROM notes');
   } catch (error) {
     context.logger.error('Database query failed:', error);
     // Don't crash, show user-friendly message
     modux.ui.showNotification('Failed to load data', 'error');
   }
   ```

---

## Complete Examples

### Example 1: Simple Markdown Renderer

**manifest.json**
```json
{
  "name": "markdown-simple",
  "version": "1.0.0",
  "displayName": "Simple Markdown",
  "type": "ui",
  "main": "main.js",
  "ui": "index.html",
  "noteTypes": ["markdown"],
  "permissions": ["storage.read", "storage.write"]
}
```

**main.js**
```javascript
function activate(context, api) {
  const disposable = api.registerNoteRenderer('markdown', {
    htmlFile: 'index.html',
    
    onMessage: async (noteId, message) => {
      if (message.action === 'renderMarkdown') {
        // Use a markdown library (would need to be bundled)
        const html = convertMarkdownToHTML(message.payload.content);
        return { html };
      }
    }
  });
  
  context.subscriptions.push(disposable);
}

function convertMarkdownToHTML(markdown) {
  // Simple markdown conversion
  return markdown
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/\n/gim, '<br>');
}

module.exports = { activate };
```

**index.html**
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { margin: 0; padding: 1rem; font-family: sans-serif; }
    #editor { width: 100%; min-height: 400px; padding: 0.5rem; }
  </style>
</head>
<body>
  <textarea id="editor"></textarea>
  <script src="index.js"></script>
</body>
</html>
```

**index.js**
```javascript
(function() {
  const editor = document.getElementById('editor');
  
  modux.onMessage = (message) => {
    if (message.type === 'render') {
      editor.value = message.payload.content;
    }
  };
  
  editor.addEventListener('input', () => {
    modux.postMessage({
      type: 'contentChanged',
      content: editor.value
    });
  });
  
  modux.postMessage({ type: 'ready' });
})();
```

### Example 2: Code Editor with Syntax Highlighting

See the complete example in `/plugin-sources/code-editor-example/`

---

## Testing & Debugging

### Development Mode

Enable development mode in Modux settings to:
- See detailed plugin logs
- Auto-reload plugins on file changes
- Access DevTools for plugin iframes

### Debugging Frontend

1. Open DevTools (F12)
2. Navigate to iframe context
3. Use console.log, breakpoints, etc.

```javascript
// index.js
console.log('Plugin loaded');
debugger; // Breakpoint
```

### Debugging Backend

Backend logs appear in main process console:

```javascript
// main.js
function activate(context, api) {
  context.logger.info('Plugin activated');
  context.logger.error('Something went wrong', error);
}
```

### Testing Checklist

- [ ] Plugin loads without errors
- [ ] UI renders correctly
- [ ] State persists when switching notes
- [ ] Content changes are saved
- [ ] Error handling works
- [ ] Performance is acceptable
- [ ] Works with multiple notes open
- [ ] Cleanup on deactivation

---

## Publishing Plugins

### Package Structure

```
my-plugin-1.0.0.zip
├── manifest.json
├── main.js
├── index.html
├── index.js
├── style.css
├── README.md
└── LICENSE
```

### Publishing Steps

1. **Test thoroughly** - Ensure plugin works in all scenarios
2. **Write documentation** - Include README with usage instructions
3. **Add license** - Choose appropriate license (MIT, Apache, etc.)
4. **Create package** - Zip all files
5. **Submit** - Upload to Modux plugin marketplace (coming soon)

### Versioning

Follow semantic versioning:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes

---

## Migration from Old Structure

If you have existing plugins with hardcoded UI strings:

### Before (Old Structure)

```javascript
// Old: Hardcoded UI string
function activate(context, api) {
  api.registerNoteRenderer('markdown', {
    render: (note) => {
      return `
        const root = document.getElementById('plugin-root');
        root.innerHTML = '<div>${note.content}</div>';
      `;
    }
  });
}
```

### After (New Structure)

**main.js**
```javascript
function activate(context, api) {
  api.registerNoteRenderer('markdown', {
    htmlFile: 'index.html'
  });
}
```

**index.html**
```html
<!DOCTYPE html>
<html>
<body>
  <div id="content"></div>
  <script src="index.js"></script>
</body>
</html>
```

**index.js**
```javascript
modux.onMessage = (message) => {
  if (message.type === 'render') {
    document.getElementById('content').textContent = message.payload.content;
  }
};
```

---

## FAQ

**Q: Can I use external libraries like React or Vue?**  
A: Yes, but you need to bundle them with your plugin. The iframe cannot load external scripts due to CSP.

**Q: How do I share data between multiple plugins?**  
A: Use the event system to emit custom events that other plugins can listen to.

**Q: Can I modify the main app UI?**  
A: No, plugins run in isolated iframes. You can request UI actions via the API (e.g., show notifications).

**Q: What happens if my plugin crashes?**  
A: The plugin iframe/worker is isolated, so it won't crash the main app. Users will see an error message.

**Q: How do I update my plugin?**  
A: Increment the version in manifest.json and republish. Users will be notified of updates.

---

## Resources

- [Modux Plugin API Reference](./api-reference.md)
- [Example Plugins](../plugin-sources/)
- [Plugin Marketplace](https://modux.app/plugins) (coming soon)
- [Community Forum](https://community.modux.app)

---

## Support

For plugin development help:
- GitHub Issues: https://github.com/modux/plugins/issues
- Discord: https://discord.gg/modux
- Email: plugins@modux.app
