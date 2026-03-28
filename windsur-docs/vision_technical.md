# Nodex -- Technical Overview

## Purpose

Nodex is a **self-evolving, extensible, scriptable, pluggable knowledge
platform**. It provides a minimal core with a powerful extension runtime
for building custom knowledge systems.

------------------------------------------------------------------------

## Architecture

### Core (Kernel)

-   Graph storage engine (nodes, edges, metadata)
-   Rendering pipeline (note types as renderers)
-   Event bus (lifecycle + user actions)
-   Extension host (sandboxed plugin runtime)

### Extension Layers

-   **Plugins**: packaged features (note types, UI panels, services)
-   **Scripts**: lightweight runtime logic bound to events or notes
-   **Adapters**: external integrations

------------------------------------------------------------------------

## Data Model

-   Notes = nodes
-   Links = typed edges
-   Supports:
    -   hierarchical edges (parent/child)
    -   relational edges (references, backlinks)
    -   block-level addressing

------------------------------------------------------------------------

## Plugin System

### Capabilities

-   Register note types (editors + renderers)
-   Extend UI (views, panels, commands)
-   Hook into events (onNoteOpen, onSave, etc.)
-   Access graph APIs

### Lifecycle

-   install → activate → run → deactivate

### Isolation

-   sandboxed execution
-   permission-based APIs

------------------------------------------------------------------------

## Scripting Engine

-   Event-driven scripts
-   Direct graph manipulation
-   Reactive automations
-   Inline or file-based scripts

------------------------------------------------------------------------

## Developer Experience

-   Built-in terminal
-   Hot-reload plugins
-   Type-safe APIs (recommended)
-   Debug hooks

------------------------------------------------------------------------

## Design Principles

-   Minimal core, maximal extensibility
-   Everything is replaceable
-   API-first design
-   Performance on large graphs

------------------------------------------------------------------------

## Goal

Enable developers to **shape the system itself**, not just use it.
