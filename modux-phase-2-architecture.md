# Nodex Phase 2 Architecture: Production-Ready Live Scripting System

## Executive Summary

This document outlines the Phase 2 architecture for Nodex, combining the best extensibility features from **VS Code** (security & sandboxing), **Emacs** (live coding & introspection), and **Trilium Notes** (in-app scripting & widgets) to create a production-ready, secure, and highly extensible note-taking application with live scripting capabilities.

---

## Design Philosophy

### Core Principles

1. **Security First**: No `eval()`, no `new Function()`, strict CSP enforcement
2. **Live Extensibility**: Edit and reload plugins without restarting the app
3. **Developer Experience**: Monaco editor, hot reload, introspection tools
4. **Isolation**: Sandboxed execution contexts for all user code
5. **Flexibility**: Support both UI and backend plugins with clear boundaries

---

## Feature Comparison Matrix

| Feature | VS Code | Emacs | Trilium | Nodex Phase 2 |
|---------|---------|-------|---------|---------------|
| **Live Code Editing** | ❌ Requires reload | ✅ Instant eval | ✅ In-app editor | ✅ Monaco + hot reload |
| **Security Model** | ✅ Process isolation | ⚠️ Full access | ⚠️ eval() based | ✅ Sandboxed iframes |
| **UI Extensions** | ✅ Webviews | ✅ Elisp UI | ✅ Widgets | ✅ Sandboxed widgets |
| **Backend Extensions** | ✅ Node.js process | ✅ Elisp runtime | ✅ Backend scripts | ✅ Separate processes |
| **Plugin Discovery** | ✅ Marketplace | ✅ Package repos | ⚠️ Manual | ✅ Built-in + external |
| **Introspection** | ⚠️ Limited | ✅ Full runtime | ⚠️ Limited | ✅ Enhanced API |
| **State Persistence** | ✅ Workspace state | ✅ Session vars | ✅ Note attributes | ✅ Plugin storage API |
| **Event System** | ✅ Rich events | ✅ Hooks/advice | ✅ Note events | ✅ Unified event bus |
| **API Documentation** | ✅ TypeScript defs | ✅ Self-documenting | ⚠️ Basic | ✅ Full TypeScript |
| **Hot Reload** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Debugging** | ✅ DevTools | ✅ Built-in debugger | ⚠️ Console only | ✅ Full DevTools |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Plugin Process 1    │ Plugin Process 2    │ Plugin Process 3  │
│ (Node.js)           │ (Node.js)           │ (Node.js)         │
│  Backend Plugin A   │  Backend Plugin B   │  Backend Plugin C │
└──────────┬──────────┴──────────┬──────────┴──────────┬─────────┘
           │ IPC (child_process) │                     │
┌──────────▼─────────────────────▼─────────────────────▼─────────┐
│                         Main Process (Node.js)                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │  Plugin Manager  │  │ Process Manager  │  │  File System  │ │
│  │   - Discovery    │  │  - Spawn/Kill    │  │   Manager     │ │
│  │   - Lifecycle    │  │  - IPC Bridge    │  │  - Plugin     │ │
│  │   - Permissions  │  │  - Monitoring    │  │    Storage    │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│           │                      │                     │         │
└───────────┼──────────────────────┼─────────────────────┼─────────┘
            │ IPC (Structured)     │                     │
┌───────────▼──────────────────────▼─────────────────────▼─────────┐
│                      Renderer Process (Chromium)                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Main Application UI                    │   │
│  │  ┌────────────────┐  ┌──────────────┐  ┌──────────────┐ │   │
│  │  │ Monaco Editor  │  │ Note Canvas  │  │  Plugin UI   │ │   │
│  │  │ (Live Coding)  │  │              │  │  Container   │ │   │
│  │  └────────────────┘  └──────────────┘  └──────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│           │                      │                     │         │
│           │ postMessage          │                     │         │
│  ┌────────▼──────────┐  ┌────────▼──────────┐  ┌──────▼──────┐ │
│  │  Plugin Sandbox   │  │  Plugin Sandbox   │  │   Plugin    │ │
│  │   (iframe #1)     │  │   (iframe #2)     │  │  Sandbox    │ │
│  │  - CSP enforced   │  │  - CSP enforced   │  │  (iframe)   │ │
│  │  - Limited API    │  │  - Limited API    │  │             │ │
│  └───────────────────┘  └───────────────────┘  └─────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

---

## Key Features from Each System

### From VS Code

#### 1. **Extension Host Architecture**
- Separate process for extension execution
- **Adaptation**: Use separate Node.js processes for backend plugins (via child_process.fork)
- **Benefit**: Complete crash isolation, OS-level resource limits, true sandboxing

#### 2. **Webview API**
- Sandboxed iframes for custom UI
- **Adaptation**: Plugin UI runs in sandboxed iframes with CSP
- **Benefit**: Security, prevents DOM pollution

#### 3. **Contribution Points**
- Declarative plugin manifest
- **Adaptation**: Enhanced manifest.json with permissions
- **Benefit**: Clear capabilities, user consent

#### 4. **Activation Events**
- Lazy loading based on triggers
- **Adaptation**: Load plugins on-demand
- **Benefit**: Faster startup, lower memory

### From Emacs

#### 1. **Live Evaluation**
- Eval code instantly without restart
- **Adaptation**: Hot reload with state preservation
- **Benefit**: Rapid development cycle

#### 2. **Introspection & Self-Documentation**
- Query runtime state, inspect functions
- **Adaptation**: Plugin introspection API
- **Benefit**: Discoverability, debugging

#### 3. **Advice System**
- Wrap/modify existing functions
- **Adaptation**: Middleware/hook system
- **Benefit**: Non-invasive extensions

#### 4. **Buffer-Local Variables**
- Scope state to context
- **Adaptation**: Note-scoped plugin state
- **Benefit**: Clean state management

### From Trilium

#### 1. **In-App Script Editor**
- Edit scripts directly in notes
- **Adaptation**: Monaco-based plugin editor
- **Benefit**: No external tools needed

#### 2. **Frontend/Backend Scripts**
- Clear separation of concerns
- **Adaptation**: UI plugins vs backend plugins
- **Benefit**: Appropriate execution context

#### 3. **Widget System**
- Custom UI components
- **Adaptation**: Sandboxed widget framework
- **Benefit**: Rich UI extensions

#### 4. **Attribute-Based Execution**
- `#run=frontendStartup` labels
- **Adaptation**: Declarative activation in manifest
- **Benefit**: Simple, declarative

#### 5. **Event-Driven Scripts**
- React to note changes
- **Adaptation**: Unified event bus
- **Benefit**: Reactive extensions

---

## Plugin Types

### 1. UI Plugins (Frontend)

**Execution Context**: Sandboxed iframe in renderer process

**Use Cases**:
- Custom note renderers (markdown, canvas, diagrams)
- UI widgets (calendar, task list, graph view)
- Visual editors (WYSIWYG, drawing tools)

**Security**:
- Strict CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'`
- No direct DOM access to main app
- Communication via postMessage only

**Example Manifest**:
```json
{
  "name": "markdown-renderer",
  "version": "1.0.0",
  "type": "ui",
  "main": "renderer.js",
  "permissions": ["ui.render", "storage.read"],
  "activationEvents": ["onNoteType:markdown"],
  "contributes": {
    "renderers": [
      {
        "noteType": "markdown",
        "component": "MarkdownRenderer"
      }
    ]
  }
}
```

### 2. Backend Plugins (Node.js)

**Execution Context**: Separate Node.js process (spawned via child_process.fork)

**Use Cases**:
- File system operations
- Database queries
- External API calls
- Background processing

**Security**:
- Separate isolated process (own V8 instance)
- Complete process isolation
- Limited Node.js API surface via IPC bridge
- Permission-based file access
- Rate limiting
- OS-level resource limits (CPU, memory)

**Example Manifest**:
```json
{
  "name": "git-sync",
  "version": "1.0.0",
  "type": "backend",
  "main": "sync.js",
  "permissions": ["fs.read", "fs.write", "network.http"],
  "activationEvents": ["onCommand:git.sync"],
  "contributes": {
    "commands": [
      {
        "id": "git.sync",
        "title": "Sync with Git"
      }
    ]
  }
}
```

### 3. Hybrid Plugins

**Execution Context**: Both iframe (UI) and separate process (backend)

**Use Cases**:
- Complex features requiring both UI and backend
- Real-time collaboration
- Advanced search with custom UI

**Example Manifest**:
```json
{
  "name": "advanced-search",
  "version": "1.0.0",
  "type": "hybrid",
  "main": "backend.js",
  "ui": "frontend.js",
  "permissions": ["ui.panel", "db.query", "storage.readwrite"],
  "activationEvents": ["onCommand:search.advanced"],
  "contributes": {
    "panels": [
      {
        "id": "search-panel",
        "title": "Advanced Search",
        "icon": "search"
      }
    ]
  }
}
```

---

## Live Scripting Workflow

### Development Mode

```
1. User opens Plugin Editor (Monaco)
   ↓
2. Edits plugin code in-app
   ↓
3. Clicks "Save & Reload" or Auto-save triggers
   ↓
4. System validates code (AST parsing, permission check)
   ↓
5. Hot reload mechanism:
   - Serialize plugin state
   - Unload old plugin
   - Load new plugin code
   - Restore state
   ↓
6. UI updates immediately (no restart)
```

### Production Mode

```
1. User installs plugin from marketplace or file
   ↓
2. System validates manifest & code signature
   ↓
3. User reviews permissions
   ↓
4. Plugin installed to plugins directory
   ↓
5. Plugin activated based on activation events
```

---

## Security Architecture

### 1. Content Security Policy (CSP)

**Main App**:
```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' ws://localhost:*;
frame-src 'none';
```

**Plugin Sandbox**:
```
default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
img-src data: blob:;
connect-src 'none';
```

### 2. Permission System

**Permission Categories**:
- `ui.*`: UI manipulation (render, panel, toolbar)
- `storage.*`: Plugin storage (read, write, delete)
- `db.*`: Database access (query, insert, update)
- `fs.*`: File system (read, write, watch)
- `network.*`: Network access (http, websocket)
- `ipc.*`: Inter-plugin communication

**Permission Request Flow**:
```typescript
// In manifest.json
{
  "permissions": ["fs.read", "network.http"]
}

// User sees permission dialog on install:
// "markdown-renderer wants to:
//  - Read files from your system
//  - Make HTTP requests
// [Allow] [Deny]"
```

### 3. Sandboxing Layers

**Layer 1: Process Isolation**
- Main process vs Renderer process
- Separate Node.js processes for each backend plugin
- Each plugin has its own V8 instance

**Layer 2: Context Isolation**
- `contextIsolation: true` in BrowserWindow
- No direct Node.js access from renderer

**Layer 3: iframe Sandboxing**
- Each plugin in separate iframe
- `sandbox="allow-scripts"` attribute
- Strict CSP per iframe

**Layer 4: API Boundary**
- Whitelist-based API exposure
- Input validation on all IPC calls
- Rate limiting per plugin

### 4. Code Validation

**Static Analysis**:
```typescript
// AST parsing to detect dangerous patterns
const dangerousPatterns = [
  /eval\(/,
  /Function\(/,
  /innerHTML\s*=/,
  /outerHTML\s*=/,
  /document\.write/,
  /__proto__/,
  /constructor\[/
];

function validatePluginCode(code: string): ValidationResult {
  const ast = parseToAST(code);
  
  // Check for dangerous patterns
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return { valid: false, error: `Forbidden pattern: ${pattern}` };
    }
  }
  
  // Check for permission usage
  const requiredPermissions = extractPermissions(ast);
  
  return { valid: true, requiredPermissions };
}
```

---

## Plugin API Design

### 1. UI Plugin API

```typescript
// Available in sandboxed iframe via postMessage

interface NodexUIAPI {
  // Rendering
  render(noteId: string, content: string): void;
  update(element: string, content: string): void;
  
  // Events
  onNoteChange(callback: (note: Note) => void): Disposable;
  onSelectionChange(callback: (selection: Selection) => void): Disposable;
  
  // Storage
  getState<T>(key: string): Promise<T>;
  setState<T>(key: string, value: T): Promise<void>;
  
  // UI Manipulation
  showNotification(message: string, type: 'info' | 'warning' | 'error'): void;
  showInputBox(options: InputBoxOptions): Promise<string | undefined>;
  
  // Communication
  sendToBackend(message: any): Promise<any>;
}

// Usage in plugin
window.addEventListener('message', (event) => {
  if (event.data.type === 'Nodex:api') {
    const api = event.data.api;
    
    api.onNoteChange((note) => {
      // Render note
      const html = renderMarkdown(note.content);
      api.render(note.id, html);
    });
  }
});
```

### 2. Backend Plugin API

```typescript
// Available in worker thread

interface NodexBackendAPI {
  // Database
  db: {
    query(sql: string, params?: any[]): Promise<any[]>;
    insert(table: string, data: object): Promise<string>;
    update(table: string, id: string, data: object): Promise<void>;
    delete(table: string, id: string): Promise<void>;
  };
  
  // File System (permission-gated)
  fs: {
    readFile(path: string): Promise<Buffer>;
    writeFile(path: string, data: Buffer): Promise<void>;
    watchFile(path: string, callback: () => void): Disposable;
  };
  
  // Events
  events: {
    on(event: string, callback: (...args: any[]) => void): Disposable;
    emit(event: string, ...args: any[]): void;
  };
  
  // Storage
  storage: {
    get<T>(key: string): Promise<T>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  };
  
  // HTTP (permission-gated)
  http: {
    get(url: string, options?: RequestOptions): Promise<Response>;
    post(url: string, data: any, options?: RequestOptions): Promise<Response>;
  };
}

// Usage in plugin
export function activate(context: PluginContext, api: NodexBackendAPI) {
  // Listen for note creation
  api.events.on('note:created', async (note) => {
    // Auto-tag based on content
    const tags = extractTags(note.content);
    await api.db.update('notes', note.id, { tags });
  });
}
```

### 3. Introspection API (Emacs-inspired)

```typescript
interface NodexIntrospectionAPI {
  // Plugin discovery
  listPlugins(): Promise<PluginInfo[]>;
  getPluginInfo(pluginId: string): Promise<PluginInfo>;
  
  // Runtime inspection
  getPluginState(pluginId: string): Promise<any>;
  getPluginAPI(pluginId: string): Promise<APIDefinition>;
  
  // Documentation
  describeFunction(pluginId: string, functionName: string): Promise<FunctionDoc>;
  searchAPI(query: string): Promise<APISearchResult[]>;
  
  // Debugging
  enableDebugMode(pluginId: string): void;
  getPluginLogs(pluginId: string): Promise<LogEntry[]>;
}
```

---

## Monaco Editor Integration

### Features

1. **Syntax Highlighting**: JavaScript/TypeScript with plugin API types
2. **IntelliSense**: Auto-completion for Nodex API
3. **Error Detection**: Real-time linting and validation
4. **Code Formatting**: Prettier integration
5. **Multi-file Support**: Edit manifest, main, UI files in tabs
6. **Version Control**: Built-in diff viewer for changes

### Implementation

```typescript
class PluginEditor {
  private monaco: Monaco.editor.IStandaloneCodeEditor;
  private currentPlugin: Plugin;
  
  async initialize() {
    // Load Monaco
    this.monaco = monaco.editor.create(container, {
      language: 'typescript',
      theme: 'vs-dark',
      automaticLayout: true,
    });
    
    // Add Nodex API types
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      NodexAPITypes,
      'Nodex.d.ts'
    );
    
    // Auto-save on change
    this.monaco.onDidChangeModelContent(
      debounce(() => this.savePlugin(), 1000)
    );
  }
  
  async savePlugin() {
    const code = this.monaco.getValue();
    
    // Validate
    const validation = await validatePluginCode(code);
    if (!validation.valid) {
      this.showError(validation.error);
      return;
    }
    
    // Hot reload
    await this.hotReload(code);
  }
  
  async hotReload(code: string) {
    // Serialize state
    const state = await this.currentPlugin.getState();
    
    // Unload
    await this.currentPlugin.deactivate();
    
    // Load new code
    const newPlugin = await this.loadPlugin(code);
    
    // Restore state
    await newPlugin.setState(state);
    
    // Activate
    await newPlugin.activate();
    
    this.showNotification('Plugin reloaded successfully');
  }
}
```

---

## Hot Reload System

### State Preservation

```typescript
interface PluginState {
  version: string;
  data: any;
  timestamp: number;
}

class HotReloadManager {
  async reload(pluginId: string, newCode: string) {
    const plugin = this.plugins.get(pluginId);
    
    // 1. Serialize state
    const state = await this.serializeState(plugin);
    
    // 2. Deactivate old plugin
    await plugin.deactivate();
    
    // 3. Unload from memory
    this.plugins.delete(pluginId);
    
    // 4. Load new code
    const newPlugin = await this.loadPlugin(pluginId, newCode);
    
    // 5. Restore state
    if (state && this.isCompatible(state.version, newPlugin.version)) {
      await newPlugin.setState(state.data);
    }
    
    // 6. Activate
    await newPlugin.activate();
    
    // 7. Update UI
    this.eventBus.emit('plugin:reloaded', pluginId);
  }
  
  private async serializeState(plugin: Plugin): Promise<PluginState> {
    // Call plugin's onSave hook if exists
    const data = plugin.onSave ? await plugin.onSave() : {};
    
    return {
      version: plugin.manifest.version,
      data,
      timestamp: Date.now()
    };
  }
}
```

### Lifecycle Hooks

```typescript
// Plugin can implement these hooks
export interface PluginLifecycle {
  // Called when plugin is first loaded
  activate(context: PluginContext, api: NodexAPI): void | Promise<void>;
  
  // Called before plugin is unloaded
  deactivate(): void | Promise<void>;
  
  // Called before hot reload (save state)
  onSave?(): any | Promise<any>;
  
  // Called after hot reload (restore state)
  onRestore?(state: any): void | Promise<void>;
}

// Example usage
export function activate(context, api) {
  let counter = 0;
  
  context.subscriptions.push(
    api.events.on('note:created', () => counter++)
  );
  
  // Save state before reload
  context.onSave = () => ({ counter });
  
  // Restore state after reload
  context.onRestore = (state) => {
    counter = state.counter;
  };
}
```

---

## Event System

### Unified Event Bus

```typescript
interface EventBus {
  // Core events
  'note:created': (note: Note) => void;
  'note:updated': (note: Note, changes: Partial<Note>) => void;
  'note:deleted': (noteId: string) => void;
  'note:opened': (note: Note) => void;
  'note:closed': (noteId: string) => void;
  
  // UI events
  'ui:ready': () => void;
  'ui:theme-changed': (theme: Theme) => void;
  'ui:panel-opened': (panelId: string) => void;
  
  // Plugin events
  'plugin:loaded': (pluginId: string) => void;
  'plugin:unloaded': (pluginId: string) => void;
  'plugin:error': (pluginId: string, error: Error) => void;
  
  // Custom events (plugin-defined)
  [key: `custom:${string}`]: (...args: any[]) => void;
}

// Middleware system (Emacs advice-inspired)
class EventBusWithMiddleware {
  private middlewares: Map<string, Middleware[]> = new Map();
  
  use(event: string, middleware: Middleware) {
    const existing = this.middlewares.get(event) || [];
    this.middlewares.set(event, [...existing, middleware]);
  }
  
  async emit(event: string, ...args: any[]) {
    const middlewares = this.middlewares.get(event) || [];
    
    let result = args;
    for (const middleware of middlewares) {
      result = await middleware(result);
      if (result === null) return; // Middleware cancelled event
    }
    
    // Emit to listeners
    this.listeners.get(event)?.forEach(cb => cb(...result));
  }
}

// Example: Add logging middleware
eventBus.use('note:created', async (args) => {
  console.log('Note created:', args[0].title);
  return args; // Pass through
});

// Example: Modify event data
eventBus.use('note:created', async ([note]) => {
  // Auto-add creation timestamp
  note.metadata.createdAt = Date.now();
  return [note];
});
```

---

## Plugin Storage API

### Scoped Storage

```typescript
interface PluginStorage {
  // Global plugin storage
  global: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
  };
  
  // Note-scoped storage (like Emacs buffer-local vars)
  note: {
    get<T>(noteId: string, key: string): Promise<T | undefined>;
    set<T>(noteId: string, key: string, value: T): Promise<void>;
    delete(noteId: string, key: string): Promise<void>;
  };
  
  // Workspace-scoped storage
  workspace: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
}

// Implementation uses SQLite
// Table: plugin_storage
// Columns: plugin_id, scope, scope_id, key, value, created_at, updated_at
```

---

## Development Tools

### 1. Plugin Inspector (DevTools Integration)

```typescript
class PluginInspector {
  // List all loaded plugins
  listPlugins(): PluginInfo[];
  
  // Inspect plugin state
  inspectState(pluginId: string): any;
  
  // View plugin logs
  getLogs(pluginId: string, level?: LogLevel): LogEntry[];
  
  // Performance profiling
  profile(pluginId: string): PerformanceMetrics;
  
  // Memory usage
  getMemoryUsage(pluginId: string): MemoryInfo;
}
```

### 2. Plugin Debugger

```typescript
// Enable source maps for debugging
// Breakpoints in Monaco editor
// Step through plugin code
// Inspect variables
```

### 3. Plugin Marketplace

```typescript
interface PluginMarketplace {
  // Search plugins
  search(query: string, filters?: SearchFilters): Promise<PluginListing[]>;
  
  // Install plugin
  install(pluginId: string): Promise<void>;
  
  // Update plugin
  update(pluginId: string): Promise<void>;
  
  // Publish plugin (for developers)
  publish(plugin: PluginPackage): Promise<void>;
}
```

---

## Migration Path from POC

### Phase 2.1: Sandboxing (Week 1-2)

- [ ] Implement iframe sandbox manager
- [ ] Create postMessage protocol
- [ ] Build plugin API boundary
- [ ] Migrate existing plugins to sandboxed model

### Phase 2.2: Monaco Integration (Week 3-4)

- [ ] Add Monaco editor to UI
- [ ] Create plugin editor component
- [ ] Implement syntax validation
- [ ] Add TypeScript definitions for API

### Phase 2.3: Hot Reload (Week 5-6)

- [ ] Build state serialization system
- [ ] Implement plugin lifecycle hooks
- [ ] Add file watcher for plugin changes
- [ ] Create hot reload mechanism

### Phase 2.4: Backend Plugins (Week 7-8)

- [ ] Set up plugin process manager (child_process.fork)
- [ ] Create plugin host entry point
- [ ] Create backend plugin API
- [ ] Implement permission system
- [ ] Build IPC bridge for process communication
- [ ] Add resource monitoring and limits

### Phase 2.5: Developer Tools (Week 9-10)

- [ ] Plugin inspector UI
- [ ] Debugging integration
- [ ] Performance profiling
- [ ] Documentation generator

---

## Performance Considerations

### 1. Plugin Loading

- **Lazy Loading**: Load plugins only when needed
- **Code Splitting**: Separate UI and backend code
- **Caching**: Cache compiled plugin code
- **Parallel Loading**: Load multiple plugins concurrently

### 2. Sandbox Overhead

- **iframe Pooling**: Reuse iframes for similar plugins
- **Virtual Scrolling**: Render only visible plugin UIs
- **Resource Limits**: CPU/memory quotas per plugin
- **Throttling**: Rate limit postMessage calls

### 3. Hot Reload Optimization

- **Incremental Updates**: Only reload changed modules
- **State Diffing**: Minimal state serialization
- **Debouncing**: Batch rapid changes
- **Background Compilation**: Compile while editing

---

## Security Checklist

- [x] No `eval()` or `new Function()` in production code
- [x] Strict CSP for all contexts
- [x] Process/thread isolation for plugins
- [x] Permission system with user consent
- [x] Input validation on all IPC boundaries
- [x] Code signing for marketplace plugins
- [x] Sandboxed iframes for UI plugins
- [x] Limited Node.js API surface for backend plugins
- [x] Rate limiting per plugin
- [x] Audit logging for sensitive operations

---

## Best of All Worlds Summary

| Aspect | Best From | Implementation |
|--------|-----------|----------------|
| **Security** | VS Code | Sandboxed iframes + separate processes |
| **Live Coding** | Emacs | Hot reload + Monaco editor |
| **In-App Editing** | Trilium | Monaco-based plugin editor |
| **Introspection** | Emacs | Plugin inspector + API docs |
| **Widget System** | Trilium | Sandboxed widget framework |
| **Event System** | Emacs | Middleware + hooks |
| **Permissions** | VS Code | Declarative manifest |
| **Backend Scripts** | Trilium | Separate process execution |
| **Developer Tools** | VS Code | Full DevTools integration |
| **State Management** | Emacs | Scoped storage (global/note/workspace) |

---

## Conclusion

Nodex Phase 2 combines:

✅ **VS Code's security model** - Sandboxed execution, permission system  
✅ **Emacs's live coding** - Hot reload, introspection, middleware  
✅ **Trilium's in-app scripting** - Monaco editor, widgets, event-driven  

This creates a **production-ready, secure, and highly extensible** note-taking application that allows users to write, edit, and reload plugins **live** without compromising security or requiring application restarts.

The architecture maintains strict security boundaries while providing the flexibility and developer experience that makes Emacs and Trilium so powerful, all within the safety guarantees of VS Code's extension model.
