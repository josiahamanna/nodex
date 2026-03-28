# Notes architecture

This document describes **current** Nodex note behavior, **target** plugin UI state sync, and the **implementation roadmap** (see also [plugin-state-protocol](../../src/shared/plugin-state-protocol.ts) in code).

## Current behavior (implemented)

- **Tree model:** One fixed **workspace root** (`title: "Workspace"`, first registered note type). All user notes are descendants. Implementation: [src/core/notes-store.ts](../../src/core/notes-store.ts), persisted in `userData/notes-tree.json` via [src/core/notes-persistence.ts](../../src/core/notes-persistence.ts).
- **Sidebar:** Flattened depth-first list from IPC `note:get-all`; drag-and-drop, cut/copy/paste, context menus: [src/renderer/components/Sidebar.tsx](../../src/renderer/components/Sidebar.tsx).
- **Host Redux:** [src/renderer/store/notesSlice.ts](../../src/renderer/store/notesSlice.ts) holds `currentNote`, `notesList`, and async thunks for IPC. This is **app-level** state, not an isolated Redux store per plugin iframe.
- **Plugin runtime:** Each open note is rendered in a **sandboxed iframe** ([SecurePluginRenderer.tsx](../../src/renderer/components/renderers/SecurePluginRenderer.tsx)). Host sends `render` / `update` with the full `Note` (id, type, title, content, metadata). Legacy `window.Nodex.postMessage(data)` maps to `action` messages (logged only unless extended).

## Target behavior (direction)

- **Note ≈ plugin instance:** One record in the tree + one active renderer for the selected note. Type selects which plugin supplies the iframe HTML.
- **Plugin UI state → host:** Structured snapshots over `postMessage` using the **plugin UI protocol** (versioned payloads). Host debounces persistence to disk under `note.metadata.pluginUiState` (see protocol constants).
- **Hydration:** On load, persisted UI state is stored on the note; the host sends a **`hydrate_plugin_ui`** message after the first `render` so plugins can initialize editors without re-parsing ad hoc fields.
- **Optional host hook:** [usePluginNoteState](../../src/renderer/hooks/usePluginNoteState.ts) reads the latest snapshot Redux cache for a `noteId` (useful for future side panels or debugging).

## Persistence boundary

| Data | Owner | Storage |
|------|--------|---------|
| `title`, `content`, tree shape, `type` | Host / user | `NoteRecord` in main store + JSON file |
| **Plugin UI snapshot** (JSON-serializable) | Plugin (via protocol) | `metadata.pluginUiState` on the same record |
| Ephemeral iframe-only state | Plugin | Not persisted unless sent via snapshot |

**Conflict rule (v1):** Host edits to `content` / `title` win for those fields. Plugin snapshots **must not** replace `content`/`title` via metadata unless we add an explicit merge policy later.

## Open decisions

1. **Redux inside every plugin?** **Recommended, not mandatory.** Plugins may use any state approach; only the **snapshot** shape on the wire is standardized. Mandatory Redux would require manifest flags and tooling (Phase 4+).
2. **Merge vs parallel store:** **v1 uses `metadata.pluginUiState`** on the note (single canonical blob per note). A parallel `pluginStateByNoteId` map could be added if we need host-only caches without mutating notes.
3. **Size / validation:** Max payload size is enforced in the protocol and main IPC (see `MAX_PLUGIN_UI_PAYLOAD_BYTES`).

## Known issues vs architecture (bugs)

If **new notes do not appear in the sidebar** after create, treat that as a **bug** (repro steps, IPC errors), not as “missing root.” The product model is a single workspace root with children—not multiple independent roots.

## Roadmap (phases)

1. **Message contract** — [plugin-state-protocol.ts](../../src/shared/plugin-state-protocol.ts), extended `MessageType` in [plugin-api.ts](../../src/shared/plugin-api.ts).
2. **Host bridge** — `SecurePluginRenderer` handles snapshots + hydrate; [pluginUiSlice](../../src/renderer/store/pluginUiSlice.ts) + [usePluginNoteState](../../src/renderer/hooks/usePluginNoteState.ts).
3. **Persistence** — IPC `note:save-plugin-ui-state`, [notes-store](../../src/core/notes-store.ts) merge + debounced save from renderer.
4. **Plugin kit** — [nodex-plugin-ui-helper.md](./nodex-plugin-ui-helper.md) (iframe helper patterns, optional Redux).

## Related files

- [plugin-state-protocol.ts](../../src/shared/plugin-state-protocol.ts)
- [nodex-plugin-ui-helper.md](./nodex-plugin-ui-helper.md)
