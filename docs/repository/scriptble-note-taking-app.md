# RFC: Programmable Knowledge System (Nodex)

## Status
Draft

## Overview

This document defines the architecture and Proof of Concept (POC) plan for a **plugin-driven, programmable knowledge system** built with Electron and JavaScript.

The system is designed as a **runtime**, not just a note-taking app.

---

# 1. Vision

A system where:

- Everything is a node, note is a node. All sorts of documents are a note.
- Behavior is defined via plugins
- UI is dynamically composed
- Users can extend the system without modifying core

---

# 2. Core Principles

1. Core is minimal and stable  
2. Plugins define functionality  
3. UI is plugin-driven  
4. Scriptability is first-class  
5. Data model is flexible (no restrictions on node types)

---

# 3. High-Level Architecture

```
Electron
├── Main Process (Core Engine)
├── Renderer (UI Shell)
├── Plugin Runtime
├── Workspace persistence (JSON: nodex-workspace.json under project data/)
```

---

# 4. Data Model

```
type Note = {
  id: string
  parentId: string | null
  type: string
  content: any
  metadata: Record<string, any>
}
```

- Tree structure via `parentId`
- Any node can be any type

---

# 5. System Layers

## 5.1 Core Engine
- Plugin loading
- Lifecycle management
- API exposure
- IPC communication

## 5.2 Renderer
- Layout system
- Mount plugin UI
- Panel management

## 5.3 Plugin Runtime
- Executes plugin code
- Registers components and behaviors

## 5.4 Data Layer

The shipped POC uses a **workspace JSON file** (`data/nodex-workspace.json`) for durable trees, WPN rows, and metadata — not an embedded SQL engine in the renderer. Plugins must not open raw DB files; they use **`window.Nodex`** / host APIs.

Logical note fields (conceptual):

```
notes (
  id TEXT PRIMARY KEY,
  parent_id TEXT,
  type TEXT,
  content TEXT
)
```

---

# 6. Plugin Architecture

## Structure

```
plugin/
  manifest.json
  index.js
  components/
```

## Manifest

```
{
  "name": "plugin-name",
  "main": "index.js"
}
```

## Lifecycle

```
activate(Nodex)
deactivate()
```

---

# 7. Core APIs

## Context Object

```
Nodex = {
  notes,
  ui,
  events,
  commands
}
```

---

## Notes API

```
create()
get()
list()
update()
```

---

## UI API

```
registerComponent(type, component)
registerPanel(name, component)
openNote(id)
```

---

## Events API

```
on(event, handler)
emit(event, data)
```

---

## Commands API

```
register(name, fn)
execute(name)
```

---

# 8. UI Composition Model

- Core controls layout
- Plugins control content

---

# 9. Rendering Pipeline

1. User selects note  
2. Core loads note  
3. Resolve note type  
4. Plugin component renders  

---

# 10. POC Scope

## Included

- Plugin loader
- Basic UI shell
- Minimal APIs
- Two plugins:
  - Text Note
  - Panel plugin

## Excluded

- Sync
- Permissions
- Marketplace

---

# 11. POC Implementation Plan

## Step 1
Electron setup (main + renderer)

## Step 2
Core API layer

## Step 3
Plugin loader

## Step 4
UI registry

## Step 5
Note system (hardcoded)

## Step 6
Text note plugin

## Step 7
Panel plugin

## Step 8
Hot reload (file watcher)

---

# 12. Plugin Rendering Flow

```
Note.type → Component registry → Render
```

---

# 13. Debugging Strategy

- Try/catch plugin execution
- Plugin logs panel
- Hot reload support

---

# 14. Success Criteria

- Plugins load dynamically
- UI changes via plugins
- New note types render without core changes
- Hot reload works

---

# 15. Future Extensions

- Sandbox (VM)
- Permissions system
- Plugin marketplace
- Sync engine
- Graph view

---

# 16. Key Insight

This system is:

> A programmable runtime for knowledge systems

NOT a static note-taking application.

---

# 17. Conclusion

- Core = stable foundation  
- Plugins = innovation layer  
- UI = dynamically composed  

The architecture ensures long-term scalability and extensibility.
