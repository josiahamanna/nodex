# Nodex Plugin Development Guide

## Table of Contents

1. [Overview](#overview)
2. [Plugin Structure](#plugin-structure)
3. [File Organization](#file-organization)
4. [Manifest Specification](#manifest-specification)
5. [React Integration](#react-integration)
6. [Backend API (main.js)](#backend-api-mainjs)
7. [Frontend API (index.js)](#frontend-api-indexjs)
8. [State Persistence](#state-persistence)
9. [Communication Pattern](#communication-pattern)
10. [Security Guidelines](#security-guidelines)
11. [Built-in Plugin Development](#built-in-plugin-development)
12. [Complete Examples](#complete-examples)
13. [Plugin Distribution Modes](#plugin-distribution-modes)
14. [Dependency Management](#dependency-management)
15. [Testing & Debugging](#testing--debugging)
16. [Publishing Plugins](#publishing-plugins)

---

## Overview

Nodex plugins are modular extensions that add custom note renderers, editors, and functionality to the application. Plugins follow a **secure-by-design** architecture inspired by VS Code and Trilium, with clear separation between backend (Node.js) and frontend (browser) code.

### Key Principles

-  **No hardcoded UI strings** - UI defined in separate HTML files
-  **React Bridge Pattern** - Shared React instance via message-based API (no bundling needed)
-  **Sandboxed execution** - Backend runs in separate Node.js child processes, frontend in iframes
-  **State persistence** - Both per-note and global state support
-  **Secure communication** - Structured message passing via plugin loader bridge
-  **Graceful degradation** - Plugins fail safely without crashing the app
-  **Built-in IDE** - Develop plugins directly inside Nodex with live preview

---

## Plugin Structure

### Required File Structure

```
my-plugin/
├── manifest.json          # Plugin metadata (REQUIRED)
├── backend.js            # Backend logic - Node.js (REQUIRED, name specified in manifest)
├── index.html            # UI structure (REQUIRED for UI plugins)
├── index.jsx             # Frontend logic - JSX (REQUIRED for UI plugins, name specified in manifest)
├── style.css             # Styles (OPTIONAL)
└── assets/               # Images, fonts, etc. (OPTIONAL)
    ├── icon.png
    └── ...
```

### Plugin Types

Plugin type is **auto-detected** based on files present:

1. **UI Plugin** - Has `index.html` + `.jsx` file (renders custom note types)
2. **Backend Plugin** - Only `.js` backend file (background processing only)
3. **Hybrid Plugin** - Has all files (UI + backend capabilities)

**Minimum Required:**
- `manifest.json` (REQUIRED)
- Backend `.js` file specified in `manifest.main` (REQUIRED)
- `index.html` + `.jsx` file specified in `manifest.ui` (REQUIRED for UI plugins)

**File Naming:**
- Backend: Any `.js` filename (e.g., `backend.js`, `main.js`, `plugin.js`)
- Frontend: Any `.jsx` filename (e.g., `index.jsx`, `editor.jsx`, `renderer.jsx`)
- Entry points specified in `manifest.json`

**Validation:** If structure is invalid, plugin fails with warning. System does not crash.

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
  "main": "backend.js",        // Backend entry point (.js file)
  "ui": "index.jsx",           // Frontend entry point (.jsx file)
  "html": "index.html",        // HTML template
  
  "noteTypes": ["markdown", "md"],
  
  "permissions": [
    "storage.read",
    "storage.write",
    "network.http"
  ],
  
  "network": {
    "whitelist": [
      "https://api.github.com/*",
      "https://*.openai.com/*"
    ],
    "requestApproval": true,
    "rateLimit": {
      "requestsPerMinute": 60,
      "requestsPerHour": 1000
    }
  },
  
  "activationEvents": [
    "onNoteType:markdown"
  ],
  
  "icon": "assets/icon.png"
}
```

### Backend File (REQUIRED)

Backend logic that runs in a separate sandboxed Node.js child process. Filename is specified in `manifest.main` (e.g., `backend.js`, `main.js`).

```javascript
// backend.js (or whatever name specified in manifest.main)

/**
 * Plugin activation function
 * @param {PluginContext} context - Plugin lifecycle context
 * @param {NodexBackendAPI} api - Backend API
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

### HTML File (REQUIRED for UI plugins)

UI structure loaded into sandboxed iframe. Filename is specified in `manifest.html` (typically `index.html`).

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
  
  <!-- Frontend logic will be injected after JSX compilation -->
  <div id="root"></div>
</body>
</html>
```

### Frontend JSX File (REQUIRED for UI plugins)

Frontend logic written in JSX that runs in the sandboxed iframe. Filename is specified in `manifest.ui` (e.g., `index.jsx`, `editor.jsx`).

**Note:** The `.jsx` file is automatically compiled to JavaScript by the built-in Babel compiler before being loaded into the iframe.

```jsx
// index.jsx (or whatever name specified in manifest.ui)
const { React } = window.Nodex;

function MarkdownEditor() {
  // DOM elements
  const editorRef = React.useRef(null);
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
    Nodex.postMessage({ type: 'ready' });
  }
  
  // Setup event listeners
  function setupEventListeners() {
    // Editor input
    editor.addEventListener('input', handleInput);
    editor.addEventListener('scroll', handleScroll);
    
    // Toolbar actions
    toolbar.addEventListener('click', handleToolbarClick);
    
    // Listen for messages from parent
    Nodex.onMessage = handleMessage;
  }
  
  // Handle editor input
  function handleInput() {
    state.content = editor.value;
    state.cursorPosition = editor.selectionStart;
    
    // Notify parent of content change
    Nodex.postMessage({
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
    Nodex.postMessage({
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
    Nodex.postMessage({
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
| `main` | string | Path to backend file - .js for dev, .bundle.js for production |
| `mode` | string | Distribution mode: "development" or "production" |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `displayName` | string | Human-readable name |
| `description` | string | Plugin description |
| `author` | string | Author name |
| `license` | string | License type (e.g., "MIT") |
| `ui` | string | Path to frontend file - .jsx for dev, .bundle.js for production (required for UI plugins) |
| `html` | string | Path to HTML template (e.g., "index.html") - required for UI plugins |
| `noteTypes` | string[] | Note types this plugin handles |
| `permissions` | string[] | Required permissions |
| `activationEvents` | string[] | When to activate plugin |
| `icon` | string | Path to plugin icon |
| `engines` | object | Compatible versions (e.g., `{"react": "^18.0.0", "nodex": "^1.0.0"}`) |
| `dependencies` | object | npm dependencies (development mode only) |
| `devDependencies` | object | npm dev dependencies (development mode only) |
| `assets` | string[] | Additional runtime files (e.g., workers, fonts) |

### Permission Types

```typescript
type Permission =
  | 'storage.read'        // Read plugin storage
  | 'storage.write'       // Write plugin storage
  | 'db.read'            // Read database (plugin tables + notes read-only)
  | 'db.write'           // Write database (plugin tables only)
  | 'fs.read'            // Read files (sandboxed to plugin directory)
  | 'fs.write'           // Write files (sandboxed to plugin directory)
  | 'network.http'       // Make HTTP requests (with approval)
  | 'ui.panel'           // Create UI panels
  | 'ui.toolbar';        // Add toolbar buttons
```

### Network Configuration

**Progressive Trust Model:**

```json
{
  "network": {
    "whitelist": ["https://api.example.com/*"],  // Pre-approved domains
    "requestApproval": true,                      // User approves new domains
    "rateLimit": {
      "requestsPerMinute": 60,
      "requestsPerHour": 1000
    }
  }
}
```

**How it works:**
1. Plugin declares known domains in `whitelist`
2. First request to new domain → User approval dialog
3. User can "Always allow" → Domain added to approved list
4. Rate limiting prevents abuse
5. All requests logged for security audit

### Activation Events

```typescript
type ActivationEvent =
  | 'onStartup'                    // When app starts
  | 'onNoteType:${noteType}'       // When note type is opened
  | 'onCommand:${commandId}'       // When command is executed
  | 'onEvent:${eventName}';        // When event is emitted
```

---

## React Integration

Nodex uses a **React Bridge Pattern** to share the main app's React instance with plugins while maintaining strict CSP and security isolation.

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ Main App (Renderer Process)                         │
│  - React 18.x + Redux                                │
│  - Nodex Core UI                                     │
└─────────────────────┬───────────────────────────────┘
                      │ Injects React Bridge (inline)
                      ▼
┌─────────────────────────────────────────────────────┐
│ Plugin Iframe (Sandboxed)                           │
│  ┌───────────────────────────────────────────────┐ │
│  │ window.Nodex.React (Message-based API)        │ │
│  │  - createElement, useState, useEffect, etc.   │ │
│  │  - All operations via postMessage             │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │ Plugin Code (index.js)                        │ │
│  │  const { React } = window.Nodex;              │ │
│  │  // Write React components normally           │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### How It Works

**1. Bridge Injection (Before Plugin Loads)**

The main app injects a React API shim as an inline script before loading the plugin:

```javascript
// Main app code (not plugin code)
const iframe = document.createElement('iframe');
iframe.sandbox = 'allow-scripts';

iframe.onload = () => {
  const iframeDoc = iframe.contentDocument;
  const script = iframeDoc.createElement('script');
  
  // Inject React bridge as inline script (CSP-compliant)
  script.textContent = generateReactBridge();
  iframeDoc.head.appendChild(script);
  
  // Then load plugin's index.html
  loadPluginHTML(iframe, pluginPath);
};
```

**2. React Bridge API**

The bridge provides a message-based React API:

```javascript
window.Nodex = {
  React: {
    createElement(type, props, ...children) {
      const id = generateId();
      window.parent.postMessage({
        type: 'react:createElement',
        id, type, props, children
      }, '*');
      return { $$typeof: Symbol.for('react.element'), id };
    },
    
    useState(initialValue) {
      const [stateId] = React.useState(() => generateId());
      const [value, setValue] = React.useState(initialValue);
      
      // Sync state with parent
      useEffect(() => {
        window.parent.postMessage({
          type: 'react:setState',
          stateId, value
        }, '*');
      }, [value]);
      
      return [value, setValue];
    },
    
    useEffect(effect, deps) {
      // Standard useEffect implementation
      return React.useEffect(effect, deps);
    },
    
    // ... other React APIs
  },
  
  ReactDOM: {
    render(element, container) {
      window.parent.postMessage({
        type: 'react:render',
        element, containerId: container.id
      }, '*');
    }
  }
};
```

**3. Plugin Usage (Simple & Familiar)**

Plugins use React exactly as they would in a normal React app:

```javascript
// index.js (plugin code)
(function() {
  const { React } = window.Nodex;
  
  function MarkdownEditor({ initialContent }) {
    const [content, setContent] = React.useState(initialContent);
    const [preview, setPreview] = React.useState(false);
    
    React.useEffect(() => {
      // Notify parent of content changes
      Nodex.postMessage({
        type: 'contentChanged',
        content
      });
    }, [content]);
    
    return React.createElement('div', { className: 'editor' },
      React.createElement('div', { className: 'toolbar' },
        React.createElement('button', {
          onClick: () => setPreview(!preview)
        }, preview ? 'Edit' : 'Preview')
      ),
      preview
        ? React.createElement('div', { 
            className: 'preview',
            dangerouslySetInnerHTML: { __html: renderMarkdown(content) }
          })
        : React.createElement('textarea', {
            value: content,
            onChange: (e) => setContent(e.target.value)
          })
    );
  }
  
  // Initialize when plugin receives note data
  Nodex.onMessage = (message) => {
    if (message.type === 'render') {
      const root = document.getElementById('root');
      Nodex.ReactDOM.render(
        React.createElement(MarkdownEditor, {
          initialContent: message.payload.content
        }),
        root
      );
    }
  };
  
  Nodex.postMessage({ type: 'ready' });
})();
```

### JSX Support (Optional)

For better developer experience, plugins can use JSX with a build step:

```jsx
// index.jsx (compiled to index.js during development)
const { React } = window.Nodex;

function MarkdownEditor({ initialContent }) {
  const [content, setContent] = React.useState(initialContent);
  const [preview, setPreview] = React.useState(false);
  
  return (
    <div className="editor">
      <div className="toolbar">
        <button onClick={() => setPreview(!preview)}>
          {preview ? 'Edit' : 'Preview'}
        </button>
      </div>
      {preview ? (
        <div className="preview" 
             dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
      ) : (
        <textarea 
          value={content} 
          onChange={(e) => setContent(e.target.value)} />
      )}
    </div>
  );
}
```

The built-in plugin IDE includes a JSX compiler (Babel) that transpiles JSX to `React.createElement` calls.

### Benefits

 **No bundling required** - Plugins don't need to bundle React (saves ~150KB per plugin)  
 **Single React version** - No version conflicts, always uses main app's React  
 **Strict CSP maintained** - Only inline scripts, no `script-src 'self'` needed  
 **Familiar API** - Developers write normal React code  
 **Type safety** - Full TypeScript definitions provided  
 **Redux integration** - Can connect to shared Redux store (opt-in)

### Redux Integration (Optional)

Plugins can access the main app's Redux store:

```javascript
const { React, useSelector, useDispatch } = window.Nodex;

function MyPlugin() {
  // Read from Redux store
  const theme = useSelector(state => state.settings.theme);
  const dispatch = useDispatch();
  
  // Dispatch actions
  const saveNote = () => {
    dispatch({ type: 'notes/save', payload: { id, content } });
  };
  
  return React.createElement('div', { className: `theme-${theme}` },
    // ... plugin UI
  );
}
```

**Security:** Plugins can only dispatch whitelisted actions declared in manifest:

```json
{
  "permissions": ["redux.read", "redux.dispatch"],
  "redux": {
    "allowedActions": ["notes/save", "notes/update"]
  }
}
```

### Version Compatibility

**Q: What happens when main app upgrades React 18 → 19?**

**A: Semantic versioning + compatibility layer:**

```json
{
  "engines": {
    "react": "^18.0.0",  // Plugin declares compatible React version
    "nodex": "^1.0.0"
  }
}
```

- Nodex maintains compatibility shims for React 18/19
- Plugins declare minimum React version
- System warns if incompatible
- Breaking changes handled via major version bumps

---

## Backend API (main.js)

The backend API runs in a separate **child process** (not worker thread) for complete isolation and provides access to Node.js capabilities.

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

### NodexBackendAPI

```typescript
interface NodexBackendAPI {
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

### Global `Nodex` Object

```typescript
interface NodexFrontendAPI {
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

Nodex supports **two types of state persistence**:

### 1. Per-Note State (Recommended for Editors)

State is saved per note, so each note remembers its own cursor position, scroll, etc.

```javascript
// Frontend (index.js)
function saveState() {
  Nodex.postMessage({
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
Nodex.onMessage = (message) => {
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
  const theme = await Nodex.storage.get('theme');
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

Following VS Code and Trilium best practices, Nodex uses a **bridge pattern** for secure communication.

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
  Nodex.postMessage({
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
Nodex.onMessage = (message) => {
  if (message.type === 'backendResponse') {
    if (message.payload.success) {
      showNotification('Saved!');
    }
  }
};
```

### Security Benefits

 **No direct access** - Frontend cannot directly call Node.js APIs  
 **Permission checking** - Bridge validates permissions before routing  
 **Message validation** - All messages are validated and sanitized  
 **Rate limiting** - Prevents message flooding  
 **Audit logging** - All plugin actions are logged  

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
-  Can use inline scripts and styles
-  Can display images from data URLs

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
   
   //  Do this
   // Ask user to configure in app settings
   ```

4. **Handle errors gracefully**
   ```javascript
   try {
     await api.db.query('SELECT * FROM notes');
   } catch (error) {
     context.logger.error('Database query failed:', error);
     // Don't crash, show user-friendly message
     Nodex.ui.showNotification('Failed to load data', 'error');
   }
   ```

---

## Built-in Plugin Development

Nodex includes a **built-in plugin IDE** that allows developers to create and test plugins directly inside the application without switching to external editors.

### Development Workflow

```
1. Open Plugin IDE (Ctrl+Shift+P → "Create Plugin")
   ↓
2. Choose template (Markdown Editor, Code Editor, Custom)
   ↓
3. Edit files in Monaco editor with syntax highlighting
   ↓
4. Live preview updates automatically
   ↓
5. Test with real notes
   ↓
6. Package as .Nodexplugin
   ↓
7. Install or share
```

### Plugin IDE Features

**1. Monaco Code Editor**
- Full TypeScript/JavaScript/JSX support
- IntelliSense with Nodex API definitions
- Error checking and linting
- Multi-file editing with tabs

**2. Live Preview**
- See plugin UI in real-time as you code
- Hot reload on file save
- Test with sample notes
- Debug console integrated

**3. File Explorer**
- Visual file tree
- Drag-and-drop file organization
- Right-click context menu (New File, Rename, Delete)
- Auto-detects plugin type based on files

**4. JSX Compiler**
- Built-in Babel transpiler
- Write JSX, get compiled JavaScript
- Source maps for debugging
- Automatic on save

**5. Package Manager**
- One-click packaging to `.Nodexplugin`
- Manifest validation before packaging
- Version bumping helper
- Export to file system

### Creating a Plugin

**Step 1: Open Plugin IDE**

```
Menu → Tools → Plugin Development
or
Ctrl+Shift+P → "Create New Plugin"
```

**Step 2: Choose Template**

```
┌─────────────────────────────────────┐
│ Choose Plugin Template              │
├─────────────────────────────────────┤
│ ○ Blank Plugin                      │
│ ○ Markdown Editor (with preview)    │
│ ○ Code Editor (syntax highlighting) │
│ ○ Rich Text Editor (WYSIWYG)        │
│ ○ Custom Renderer                   │
└─────────────────────────────────────┘
```

**Step 3: Edit Files**

The IDE opens with a default structure:

```
my-plugin/
├── manifest.json    ← Edit metadata
├── main.js          ← Backend logic
├── index.html       ← UI structure
├── index.jsx        ← Frontend logic (JSX)
└── style.css        ← Styles
```

**Step 4: Write Code with IntelliSense**

```jsx
// index.jsx - Full autocomplete support
const { React, useSelector } = window.Nodex;

function MyEditor({ note }) {
  const [content, setContent] = React.useState(note.content);
  
  // IntelliSense shows available Nodex APIs
  const theme = useSelector(state => state.settings.theme);
  
  return (
    <div className={`editor theme-${theme}`}>
      <textarea 
        value={content}
        onChange={e => setContent(e.target.value)}
      />
    </div>
  );
}
```

**Step 5: Live Preview**

```
┌─────────────────────────────────────────────────────┐
│ Editor (index.jsx)          │ Live Preview          │
├─────────────────────────────┼───────────────────────┤
│ const { React } = Nodex;    │ ┌─────────────────┐   │
│                             │ │ [Your Plugin UI]│   │
│ function MyEditor() {       │ │                 │   │
│   return (                  │ │  ┌───────────┐  │   │
│     <div>...</div>          │ │  │ textarea  │  │   │
│   );                        │ │  └───────────┘  │   │
│ }                           │ └─────────────────┘   │
│                             │                       │
│ [Save] [Test] [Package]     │ [Reload] [Debug]      │
└─────────────────────────────┴───────────────────────┘
```

**Step 6: Test with Real Notes**

```javascript
// Click "Test" button to load plugin with a test note
// Or select an existing note from your collection
```

**Step 7: Package Plugin**

```
Click "Package" → Validates manifest → Creates my-plugin-1.0.0.Nodexplugin
```

### Development Tools

**Debug Console**

```javascript
// Your plugin code
console.log('Debug info:', data);
console.error('Something went wrong');

// Appears in IDE debug console
// [Plugin:my-plugin] Debug info: {...}
// [Plugin:my-plugin] ERROR: Something went wrong
```

**Network Monitor**

```
Shows all HTTP requests made by plugin:
┌────────────────────────────────────────┐
│ GET https://api.github.com/repos       │
│ Status: 200 OK                         │
│ Time: 234ms                            │
└────────────────────────────────────────┘
```

**State Inspector**

```
View plugin state in real-time:
┌────────────────────────────────────────┐
│ State:                                 │
│ {                                      │
│   content: "Hello world",              │
│   cursorPos: 11,                       │
│   isPreview: false                     │
│ }                                      │
└────────────────────────────────────────┘
```

### TypeScript Definitions

The IDE includes full TypeScript definitions for the Nodex API:

```typescript
// @types/nodex.d.ts (automatically available)
declare global {
  interface Window {
    Nodex: {
      React: typeof React;
      ReactDOM: typeof ReactDOM;
      useSelector: typeof useSelector;
      useDispatch: typeof useDispatch;
      postMessage: (message: any) => void;
      onMessage: ((message: any) => void) | null;
      storage: {
        get<T>(key: string): Promise<T | undefined>;
        set<T>(key: string, value: T): Promise<void>;
        delete(key: string): Promise<void>;
      };
      ui: {
        showNotification(message: string, type?: 'info' | 'warning' | 'error'): void;
      };
    };
  }
}
```

### Hot Reload

Changes are automatically reloaded:

1. Edit `index.jsx`
2. Save file (Ctrl+S)
3. IDE compiles JSX → JavaScript
4. Plugin iframe reloads automatically
5. State is preserved (if possible)

### Sharing Plugins

**Export to File System**

```
File → Export Plugin → Choose location → my-plugin-1.0.0.Nodexplugin
```

**Install from IDE**

```
File → Install Plugin → Select .Nodexplugin file
```

**Publish to Marketplace** (Coming Soon)

```
File → Publish to Marketplace → Login → Upload
```

### Best Practices for Development

1. **Start with a template** - Faster than starting from scratch
2. **Use JSX** - More readable than `React.createElement`
3. **Test frequently** - Use live preview to catch issues early
4. **Check console** - Watch for errors and warnings
5. **Validate manifest** - IDE validates before packaging
6. **Version properly** - Follow semantic versioning

### Keyboard Shortcuts

```
Ctrl+S          Save current file
Ctrl+Shift+S    Save all files
Ctrl+B          Toggle file explorer
Ctrl+`          Toggle debug console
Ctrl+Shift+P    Package plugin
Ctrl+R          Reload preview
F5              Test with current note
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
  
  Nodex.onMessage = (message) => {
    if (message.type === 'render') {
      editor.value = message.payload.content;
    }
  };
  
  editor.addEventListener('input', () => {
    Nodex.postMessage({
      type: 'contentChanged',
      content: editor.value
    });
  });
  
  Nodex.postMessage({ type: 'ready' });
})();
```

### Example 2: Code Editor with Syntax Highlighting

See the complete example in `/plugin-sources/code-editor-example/`

---

## Plugin Distribution Modes

Nodex supports two distinct plugin distribution modes to serve different use cases: **Development Mode** for plugin creators and **Production Mode** for end users.

### Overview

```
Development Package (.Nodexplugin-dev)
├── Source files (.jsx, .js)
├── package.json (dependency list)
└── No node_modules (fetched on demand)
     ↓
     Compile & Bundle
     ↓
Production Package (.Nodexplugin)
├── Compiled bundles (.bundle.js)
├── All dependencies bundled
└── Optimized for end users
```

### Development Mode (.Nodexplugin-dev)

**Purpose:** For developers creating or modifying plugins

**Package Structure:**
```
pdf-viewer-1.0.0.Nodexplugin-dev
├── manifest.json          # mode: "development"
├── package.json           # Lists npm dependencies
├── backend.js             # Backend source code
├── index.html             # HTML template
├── index.jsx              # Frontend source code (JSX)
├── style.css              # Styles
├── assets/                # Static assets
│   └── icon.png
└── README.md              # Development notes
```

**Characteristics:**
-  Editable source code
-  Hot reload during development
-  Dependencies fetched on demand
-  Can be opened in Plugin IDE
-  Smaller package size (no node_modules)
- ⚠️ Requires compilation before use

**Example manifest.json:**
```json
{
  "name": "pdf-viewer",
  "version": "1.0.0",
  "mode": "development",
  
  "main": "backend.js",
  "ui": "index.jsx",
  "html": "index.html",
  
  "dependencies": {
    "pdfjs-dist": "^3.11.174",
    "react-pdf": "^6.2.2"
  },
  
  "devDependencies": {
    "@types/react": "^18.0.0"
  }
}
```

### Production Mode (.Nodexplugin)

**Purpose:** For end users installing and using plugins

**Package Structure:**
```
pdf-viewer-1.0.0.Nodexplugin
├── manifest.json          # mode: "production"
├── backend.bundle.js      # Compiled backend (with dependencies)
├── index.html             # HTML template
├── index.bundle.js        # Compiled frontend (with dependencies)
├── style.css              # Styles
└── assets/                # Static assets
    ├── icon.png
    └── pdf.worker.js      # Additional runtime files
```

**Characteristics:**
-  Pre-compiled and bundled
-  All dependencies included
-  Instant loading (no compilation)
-  Optimized and minified
-  Ready for distribution
- ❌ Not editable (source not included)

**Example manifest.json:**
```json
{
  "name": "pdf-viewer",
  "version": "1.0.0",
  "mode": "production",
  
  "main": "backend.bundle.js",
  "ui": "index.bundle.js",
  "html": "index.html",
  
  "assets": [
    "pdf.worker.js"
  ]
}
```

### Comparison Table

| Feature | Development Mode | Production Mode |
|---------|-----------------|-----------------|
| **File Extension** | `.Nodexplugin-dev` | `.Nodexplugin` |
| **Source Code** | Included (.jsx, .js) | Not included |
| **Compiled Code** | Generated on load | Pre-compiled |
| **Dependencies** | Listed in package.json | Bundled in .bundle.js |
| **node_modules** | Not included | Not needed |
| **Package Size** | Small (~50KB) | Larger (~500KB-2MB) |
| **Load Time** | Slower (compile first) | Fast (instant) |
| **Editable** | Yes (in Plugin IDE) | No |
| **Hot Reload** | Yes | No |
| **Use Case** | Plugin development | End user installation |

### Distribution Workflow

```
Developer creates plugin
     ↓
Writes source code (.jsx, .js)
     ↓
Adds dependencies (package.json)
     ↓
Tests in Plugin IDE
     ↓
Exports as .Nodexplugin-dev (for sharing source)
     OR
Exports as .Nodexplugin (for distribution)
     ↓
User installs plugin
     ↓
If .Nodexplugin-dev: Opens in Plugin IDE
If .Nodexplugin: Installs and uses immediately
```

---

## Dependency Management

Nodex provides a sophisticated dependency management system that balances developer convenience with security and isolation.

### Architecture Overview

```
Plugin Development:
┌─────────────────────────────────────────────────────┐
│ Plugin IDE                                          │
│  ┌────────────────────────────────────────────┐    │
│  │ pdf-viewer/                                 │    │
│  │  ├── package.json                           │    │
│  │  │   {                                      │    │
│  │  │     "dependencies": {                    │    │
│  │  │       "pdfjs-dist": "^3.11.174"         │    │
│  │  │     }                                    │    │
│  │  │   }                                      │    │
│  │  └── index.jsx                              │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────┘
                      │ Dependency detected
                      ▼
┌─────────────────────────────────────────────────────┐
│ Dependency Installer                                │
│  "Install pdfjs-dist@3.11.174?"                    │
│  [Install] [Cancel]                                 │
│  ☐ Auto-sync in future                             │
└─────────────────────┬───────────────────────────────┘
                      │ User clicks Install
                      ▼
┌─────────────────────────────────────────────────────┐
│ Isolated Plugin Cache                               │
│  ~/.nodex/plugin-cache/                            │
│   └── pdf-viewer/                                   │
│       └── node_modules/                             │
│           └── pdfjs-dist@3.11.174/                 │
└─────────────────────────────────────────────────────┘
```

### Isolated Cache Structure

Each plugin has its own isolated dependency cache:

```
~/.nodex/plugin-cache/
├── pdf-viewer/
│   └── node_modules/
│       ├── pdfjs-dist@3.11.174/
│       │   ├── build/
│       │   ├── web/
│       │   └── package.json
│       └── react-pdf@6.2.2/
│           └── ...
├── markdown-editor/
│   └── node_modules/
│       ├── marked@4.0.0/
│       └── highlight.js@11.0.0/
└── code-editor/
    └── node_modules/
        ├── monaco-editor@0.34.0/
        └── prismjs@1.29.0/
```

**Benefits:**
-  **Complete isolation** - No version conflicts between plugins
-  **Clear ownership** - Each plugin owns its dependencies
-  **Easy cleanup** - Delete plugin = delete its cache
-  **Debugging** - Know exactly what each plugin uses
-  **Security** - Malicious plugin can't affect others

### Dependency Installation Flow

#### Manual Mode (Default)

```
1. User opens dev plugin or edits package.json
   ↓
2. Nodex detects new/changed dependencies
   ↓
3. Check if dependencies exist in cache
   ↓
4. If missing:
   ┌──────────────────────────────────────────┐
   │ Install Dependencies                     │
   ├──────────────────────────────────────────┤
   │ Plugin "PDF Viewer" requires:            │
   │                                          │
   │   • pdfjs-dist@3.11.174                 │
   │   • react-pdf@6.2.2                     │
   │                                          │
   │ Install now?                             │
   │                                          │
   │ [Install] [Cancel]                       │
   │                                          │
   │ ☐ Remember my choice (auto-fetch)       │
   └──────────────────────────────────────────┘
   ↓
5. User clicks Install
   ↓
6. npm install to ~/.nodex/plugin-cache/pdf-viewer/
   ↓
7. Show progress: "Installing pdfjs-dist..."
   ↓
8. Dependencies ready, compile plugin
   ↓
9. Load plugin with dependencies
```

#### Auto-Fetch Mode (Optional)

```
Settings: ☑ Auto-fetch dependencies

1. User opens dev plugin
   ↓
2. Nodex detects dependencies
   ↓
3. Show notification: "Installing dependencies for PDF Viewer..."
   ↓
4. Auto-install to cache (no prompt)
   ↓
5. Load plugin when ready
```

### Dependency Update Flow

#### Manual Confirmation (Default)

```
1. User edits package.json:
   "pdfjs-dist": "^3.11.174" → "^4.0.0"
   ↓
2. Nodex detects change
   ↓
3. Show dialog:
   ┌──────────────────────────────────────────┐
   │ Dependency Changes Detected              │
   ├──────────────────────────────────────────┤
   │ The following changes were detected:     │
   │                                          │
   │   ↑ pdfjs-dist: 3.11.174 → 4.0.0       │
   │   + react-pdf: 6.2.2 (new)              │
   │   - old-library (removed)                │
   │                                          │
   │ Update dependencies?                     │
   │                                          │
   │ [Update] [Cancel]                        │
   │                                          │
   │ ☐ Auto-sync in future                   │
   └──────────────────────────────────────────┘
   ↓
4. User clicks Update
   ↓
5. Update cache, recompile, reload preview
```

#### Auto-Sync Mode (Optional)

```
Settings: ☑ Auto-sync dependencies

1. User edits package.json
   ↓
2. Nodex detects change
   ↓
3. Show notification: "Updating pdfjs-dist to 4.0.0..."
   ↓
4. Auto-update cache (no prompt)
   ↓
5. Recompile and reload
```

### Settings Configuration

**Location:** Settings → Plugin Development

```
┌─────────────────────────────────────────────────────┐
│ Plugin Development Settings                         │
├─────────────────────────────────────────────────────┤
│ Dependency Management:                              │
│                                                     │
│ ☐ Auto-fetch dependencies when opening plugins     │
│   Automatically install dependencies without        │
│   prompting (recommended for experienced devs)      │
│                                                     │
│ ☐ Auto-sync when package.json changes              │
│   Automatically update dependencies when            │
│   package.json is modified                          │
│                                                     │
│ Cache Location:                                     │
│ ~/.nodex/plugin-cache/                             │
│ [Change Location] [Clear All Caches]                │
│                                                     │
│ [Save Settings]                                     │
└─────────────────────────────────────────────────────┘
```

### Dependency Management UI (Plugin IDE)

**Dependency Panel:**

```
┌─────────────────────────────────────────────────────┐
│ Dependencies (pdf-viewer)                           │
├─────────────────────────────────────────────────────┤
│ Production Dependencies:                            │
│  ✓ pdfjs-dist@3.11.174         [↑ Update] [Remove] │
│  ✓ react-pdf@6.2.2             [↑ Update] [Remove] │
│                                                     │
│ Development Dependencies:                           │
│  ✓ @types/react@18.0.0         [↑ Update] [Remove] │
│                                                     │
│ [+ Add Dependency]                                  │
│                                                     │
│ Status: ✓ All dependencies installed                │
│ Cache: ~/.nodex/plugin-cache/pdf-viewer            │
│ Size: 2.4 MB                                        │
│                                                     │
│ [Reinstall All] [Clear Cache] [View in Explorer]   │
└─────────────────────────────────────────────────────┘
```

**Add Dependency Dialog:**

```
┌─────────────────────────────────────────────────────┐
│ Add Dependency                                      │
├─────────────────────────────────────────────────────┤
│ Package Name:                                       │
│ [pdfjs-dist                    ] [Search]          │
│                                                     │
│ Search Results:                                     │
│  ○ pdfjs-dist@3.11.174 (latest)                    │
│    PDF.js library for rendering PDFs               │
│    Downloads: 2.5M/week                             │
│                                                     │
│  ○ pdfjs-dist@3.10.111                             │
│                                                     │
│ Version:                                            │
│ [^3.11.174        ▼]                               │
│                                                     │
│ Type:                                               │
│ ○ Production  ○ Development                         │
│                                                     │
│ [Add to package.json] [Cancel]                      │
└─────────────────────────────────────────────────────┘
```

### Complete Workflow Examples

#### Example 1: Creating PDF Viewer Plugin

**Step-by-Step:**

```
1. User: Create New Plugin → "PDF Viewer"
   ↓
2. Nodex: Creates plugin workspace
   pdf-viewer/
   ├── manifest.json
   ├── package.json (empty dependencies)
   ├── backend.js (template)
   ├── index.html (template)
   └── index.jsx (template)
   ↓
3. User: Opens Dependency Panel → Add Dependency
   ↓
4. User: Searches "pdfjs-dist" → Selects 3.11.174
   ↓
5. Nodex: Updates package.json
   {
     "dependencies": {
       "pdfjs-dist": "^3.11.174"
     }
   }
   ↓
6. Nodex: Detects new dependency
   ┌──────────────────────────────────────────┐
   │ Install pdfjs-dist@3.11.174?             │
   │ [Install] [Cancel]                       │
   │ ☐ Auto-fetch in future                   │
   └──────────────────────────────────────────┘
   ↓
7. User: Clicks Install
   ↓
8. Nodex: Shows progress
   "Installing pdfjs-dist@3.11.174..."
   [████████░░] 80%
   ↓
9. Nodex: Installation complete
   Cache: ~/.nodex/plugin-cache/pdf-viewer/node_modules/
   ↓
10. User: Writes code in index.jsx
    import * as pdfjsLib from 'pdfjs-dist';
    
    function PDFViewer({ url }) {
      // Use pdfjs
    }
   ↓
11. Nodex: Compiles with dependencies
    Bundling: index.jsx + pdfjs-dist → index.bundle.js
   ↓
12. Nodex: Shows live preview
    [PDF Viewer renders successfully]
   ↓
13. User: Saves and tests
   ↓
14. User: Export → Production Package
   ↓
15. Nodex: Creates pdf-viewer-1.0.0.Nodexplugin
    ├── manifest.json (mode: "production")
    ├── backend.bundle.js
    ├── index.bundle.js (includes pdfjs-dist)
    └── index.html
```

#### Example 2: Updating Dependencies

**Scenario:** User wants to upgrade pdfjs-dist

```
1. User: Opens package.json
   Current: "pdfjs-dist": "^3.11.174"
   ↓
2. User: Changes to "^4.0.0"
   ↓
3. Nodex: Detects change immediately
   ┌──────────────────────────────────────────┐
   │ Dependency Changes Detected              │
   ├──────────────────────────────────────────┤
   │ ↑ pdfjs-dist: 3.11.174 → 4.0.0         │
   │                                          │
   │ ⚠ Major version update detected          │
   │ This may include breaking changes.       │
   │                                          │
   │ Update dependency?                       │
   │ [Update] [Cancel]                        │
   │ ☐ Auto-sync in future                   │
   └──────────────────────────────────────────┘
   ↓
4. User: Clicks Update
   ↓
5. Nodex: Uninstalls old version
   "Removing pdfjs-dist@3.11.174..."
   ↓
6. Nodex: Installs new version
   "Installing pdfjs-dist@4.0.0..."
   [████████░░] 80%
   ↓
7. Nodex: Recompiles plugin
   "Recompiling with new dependencies..."
   ↓
8. Nodex: Reloads preview
   ⚠ Warning: Breaking changes detected
   Check console for migration guide
   ↓
9. User: Tests with new version
   ↓
10. If issues: User can revert in package.json
    "pdfjs-dist": "^3.11.174"
    → Nodex prompts to downgrade
```

#### Example 3: Multiple Plugins Development

**Scenario:** User developing 3 plugins simultaneously

```
Plugin IDE State:
┌─────────────────────────────────────────────────────┐
│ Tabs: [PDF Viewer] [Markdown] [Code Editor]        │
├─────────────────────────────────────────────────────┤
│ File Explorer:                                      │
│ ├─ pdf-viewer/                                      │
│ │  ├─ package.json (pdfjs-dist@3.11.174)           │
│ │  └─ index.jsx                                     │
│ ├─ markdown-editor/                                 │
│ │  ├─ package.json (marked@4.0.0)                  │
│ │  └─ index.jsx                                     │
│ └─ code-editor/                                     │
│    ├─ package.json (monaco-editor@0.34.0)          │
│    └─ index.jsx                                     │
└─────────────────────────────────────────────────────┘

Cache Structure:
~/.nodex/plugin-cache/
├── pdf-viewer/node_modules/pdfjs-dist/
├── markdown-editor/node_modules/marked/
└── code-editor/node_modules/monaco-editor/

Each plugin:
- Has isolated dependencies
- Can be edited independently
- Hot reloads separately
- No conflicts between versions
```

### Bundling Process

When exporting to production, Nodex bundles all dependencies:

**Frontend Bundling (Rollup):**

```javascript
// Nodex internal bundler
import { rollup } from 'rollup';
import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

async function bundleFrontend(pluginDir, cacheDir) {
  const bundle = await rollup({
    input: `${pluginDir}/index.jsx`,
    plugins: [
      resolve({
        browser: true,
        preferBuiltins: false,
        // Use plugin's isolated cache
        customResolveOptions: {
          moduleDirectories: [`${cacheDir}/node_modules`]
        }
      }),
      commonjs(),
      babel({
        presets: ['@babel/preset-react'],
        babelHelpers: 'bundled'
      }),
      terser()  // Minify for production
    ],
    external: ['react', 'react-dom']  // Use Nodex's React
  });
  
  const { output } = await bundle.generate({
    format: 'iife',
    name: 'PluginBundle',
    globals: {
      'react': 'window.Nodex.React',
      'react-dom': 'window.Nodex.ReactDOM'
    }
  });
  
  return output[0].code;
}
```

**Backend Bundling (esbuild):**

```javascript
import { build } from 'esbuild';

async function bundleBackend(pluginDir, cacheDir) {
  await build({
    entryPoints: [`${pluginDir}/backend.js`],
    bundle: true,
    platform: 'node',
    target: 'node16',
    outfile: `${pluginDir}/backend.bundle.js`,
    external: ['electron'],  // Don't bundle Electron APIs
    nodePaths: [`${cacheDir}/node_modules`],
    minify: true
  });
}
```

### Security Considerations

**Dependency Validation:**

```javascript
// Before installing dependencies
async function validateDependency(packageName, version) {
  // Check against known malicious packages
  const isMalicious = await checkMaliciousDB(packageName);
  if (isMalicious) {
    throw new Error(`Package ${packageName} is flagged as malicious`);
  }
  
  // Verify package exists on npm
  const exists = await npmRegistry.packageExists(packageName, version);
  if (!exists) {
    throw new Error(`Package ${packageName}@${version} not found`);
  }
  
  // Check package size (warn if > 50MB)
  const size = await npmRegistry.getPackageSize(packageName, version);
  if (size > 50 * 1024 * 1024) {
    const confirm = await showWarning(
      `Package ${packageName} is ${formatSize(size)}. Continue?`
    );
    if (!confirm) throw new Error('Installation cancelled');
  }
}
```

**Sandboxed Installation:**

```javascript
// Install dependencies in isolated environment
async function installDependencies(pluginName, dependencies) {
  const cacheDir = `${PLUGIN_CACHE}/${pluginName}`;
  
  // Create isolated directory
  await fs.mkdir(cacheDir, { recursive: true });
  
  // Generate temporary package.json
  const tempPackageJson = {
    name: `nodex-plugin-${pluginName}`,
    version: '1.0.0',
    dependencies
  };
  
  await fs.writeFile(
    `${cacheDir}/package.json`,
    JSON.stringify(tempPackageJson, null, 2)
  );
  
  // Run npm install with restrictions
  await exec('npm install --no-scripts --ignore-scripts', {
    cwd: cacheDir,
    env: {
      ...process.env,
      npm_config_audit: 'false',  // Skip audit for speed
      npm_config_fund: 'false'    // Skip funding messages
    }
  });
}
```

---

## Testing & Debugging

### Development Mode

Enable development mode in Nodex settings to:
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
5. **Submit** - Upload to Nodex plugin marketplace (coming soon)

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
Nodex.onMessage = (message) => {
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

- [Nodex Plugin API Reference](./api-reference.md)
- [Example Plugins](../plugin-sources/)
- [Plugin Marketplace](https://Nodex.app/plugins) (coming soon)
- [Community Forum](https://community.Nodex.app)

---

## Support

For plugin development help:
- GitHub Issues: https://github.com/Nodex/plugins/issues
- Discord: https://discord.gg/Nodex
- Email: plugins@Nodex.app
