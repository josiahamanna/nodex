# Standard plugin contract (UI state and theme)

This document is the **normative contract** for how Nodex **iframe plugins** sync UI-only state with the host and match application theming.

It is **not** about copying sample folders into `userData` (that is [src/core/seed-user-plugins.ts](../../src/core/seed-user-plugins.ts) and [plugin-prod-dev-layout.md](./plugin-prod-dev-layout.md)).

**Sample plugin layout**: `plugin-sources/markdown` and `plugin-sources/tiptap` are the canonical React examples (including `@nodex/plugin-ui`). The same trees live under `plugins/user/markdown` and `plugins/user/tiptap`, shipped via `plugins/user` in `forge.config.js` `extraResource`. First-run seeding prefers `plugins/user/<name>`, then `plugins/<name>`, then `plugin-sources/<name>` (unpackaged dev).

## Cross-references

| Topic | Location |
|-------|----------|
| Versioned snapshot shape, size limits, metadata key | [src/shared/plugin-state-protocol.ts](../../src/shared/plugin-state-protocol.ts) |
| Host iframe bridge, debounced save, theme push | [src/renderer/components/renderers/SecurePluginRenderer.tsx](../../src/renderer/components/renderers/SecurePluginRenderer.tsx) |
| Plugin author cookbook (vanilla + optional Redux) | [nodex-plugin-ui-helper.md](./nodex-plugin-ui-helper.md) |
| Notes + plugin UI roadmap | [notes.md](./notes.md) |

## 1. State management in the iframe

- The **Electron renderer (host)** uses Redux for the Nodex shell.
- **Inside the sandboxed iframe**, use any model you prefer: React `useState`, a small module, or **Redux** for larger UIs. Redux in the iframe is **recommended** for complex plugins but **not mandatory**—see [nodex-plugin-ui-helper.md](./nodex-plugin-ui-helper.md).

## 2. Sync with the note store via `postMessage`

- UI snapshots are sent **iframe → host** as `postMessage` (type `plugin_ui_snapshot` / `MessageType.PLUGIN_UI_SNAPSHOT`).
- The host persists them on the note as **`metadata.pluginUiState`** (see `PLUGIN_UI_METADATA_KEY` in the protocol module) and writes through to disk via IPC.
- Plugins should call the injected API **`window.Nodex.postPluginUiState(state)`** with a **JSON-serializable** object (keep it small; respect `MAX_PLUGIN_UI_PAYLOAD_BYTES` in the protocol).

## 3. Host “hook” and debouncing

- The built-in persistence **hook** exposed to plugins is **`window.Nodex.postPluginUiState(state)`** (plus `window.Nodex.onMessage` for inbound messages).
- The **host debounces** writes to disk (~400ms) after each snapshot. Plugins may add **in-plugin debounce** (~300ms) for very chatty UI if desired.

## 4. Loading / hydrating state

- On load, the host sends a **`render`** message whose `payload` is the full note (including `metadata.pluginUiState` when present).
- When persisted UI state exists, the host also sends **`hydrate_plugin_ui`** (`MessageType.HYDRATE_PLUGIN_UI`) with `{ v, state }`.
- Plugins should apply this state when opening a note; **missing** state means start from plugin defaults (fresh UI).

## 5. Theme

- For plugins whose manifest uses **`theme: inherit`** (default), the host injects design tokens and pushes updates via **`nodex-theme-update`** (`NODEX_IFRAME_THEME_MESSAGE`) so the iframe can match light/dark Nodex.
- **`theme: isolated`** plugins do not receive host theme injection (see `SecurePluginRenderer` + [iframe-theme.ts](../../src/renderer/theme/iframe-theme.ts)).
