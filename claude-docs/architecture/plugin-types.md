# Plugin tiers vs manifest `type`

Nodex uses two different “type” ideas:

1. **Manifest `type`** (`ui` | `backend` | `hybrid`) — how the plugin is built (main process, UI bundle, hybrid). See the JSON schema in [`src/core/manifest-schema.ts`](../../src/core/manifest-schema.ts).

2. **Host tier** (`system` | `core` | `user`) — where the plugin comes from and what the app shows in the **Plugins** UI and **new note** type pickers. Declared as optional `hostTier` in `manifest.json` for plugins under **bundled core** roots only; user-installed plugins are always treated as `user` (manifest values are ignored for security).

| Tier | Plugins sidebar / Plugin Manager | “New note” type picker |
|------|----------------------------------|-------------------------|
| **system** | Hidden | Hidden (e.g. bundled Monaco **code** editor) |
| **core** | Hidden | Shown |
| **user** | Shown | Shown |

Implementation notes:

- Bundled plugins under `plugins/core` default to **`core`** if `hostTier` is omitted.
- The **code** editor plugin sets `"hostTier": "system"` in [`plugins/core/code/manifest.json`](../../plugins/core/code/manifest.json).
- Renderer IPC: all registered types remain available for opening existing notes (`getRegisteredTypes`). Note creation, the notes UI, and **Plugin IDE → Preview note type** use `getSelectableNoteTypes` (excludes system). The IDE preview list also drops **`root`** (workspace home pseudo-type).
- **Headless / browser API:** `GET /notes/types/selectable` returns only types registered on the **headless session registry** (marketplace-installed `.nodexplugin` packages for that server). It does **not** inject `markdown` / `text` unless those plugins are actually loaded. Baseline types in `HEADLESS_REGISTERED_TYPES` still apply to **`/notes/types/registered`**, workspace seeding, and compatibility with folder-based projects — not to the create-note picker.
- Inventory and “installed” lists for Plugin Manager only include **`user`** tier plugins.
- **Sample seed notes** (new empty workspace): Home still follows `pickWorkspaceOverviewType` from full registered types; **child** samples use `registry.getSelectableNoteTypes()` via [`sampleChildNoteTypes`](../../src/core/notes-store-seed.ts), so **system** types (e.g. `code`) are not auto-created under Home.

For end-user oriented documentation, see **[PLUGIN_SYSTEM.md](../../PLUGIN_SYSTEM.md)** (overview, ZIP import, tips). This file is the architecture reference for tiers and visibility.
