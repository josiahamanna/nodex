# Modular plugins architecture (no iframes)

## Purpose

Nodex loads **plugins** that contribute UI and behavior without embedding third-party markup in **iframes**. Shell regions and note editors mount **React components** supplied by plugins (or first-party shims). Optional **SES** (`lockdown` + `Compartment`) isolates untrusted plugin code in the renderer; **system plugins** shipped in the app bundle may run as trusted modules.

This document complements [detach-ui-from-logic.md](./detach-ui-from-logic.md) (single UI, IPC vs HTTP transport). Bundled Markdown docs for authors are seeded into the notes DB from `docs/bundled-plugin-authoring/` — see [bundled-documentation-seeding.md](./bundled-documentation-seeding.md).

## Plugin kinds

| Axis | Description |
|------|--------------|
| **System vs user** | System plugins ship with the app (trusted). User plugins are installed later; same API surface. |
| **UI vs non-UI** | UI plugins export React components for shell slots and/or note-type editors. Non-UI plugins register commands, background services, and note-type metadata without UI. |

## Shell surface (slots)

Plugins may contribute React components to:

1. **Rail menu** — activity rail entries (icon + command / open view).
2. **Side panel** — combined chrome: menu strip + body (primary sidebar region).
3. **Primary area** — main editor region (tabbed).
4. **Companion** — right/auxiliary column.

Registration flows through **`ShellViewRegistry`** (`src/renderer/shell/views/ShellViewRegistry.tsx`): each view has an id, title, default region, and **`component`** (React). The workbench renders **`ShellViewHost`**, which mounts the component in a normal DOM subtree (no iframe).

## Note types

Note content is rendered by **`NoteTypeReactRenderer`** (`src/renderer/components/renderers/NoteTypeReactRenderer.tsx`), which maps `note.type` to a first-party or plugin-registered React editor. Persistence uses the existing `window.Nodex` note APIs (`saveNoteContent`, `saveNotePluginUiState`); there is **no** `postMessage` bridge for note editing.

Legacy **HTML/string** plugin renderers (`getPluginHTML`) are superseded by this model for built-in types.

## Cross-platform host API

Plugins must **not** use Node `fs`, raw `sqlite`, or ambient `fetch` without policy. They call a **single host capability object** (aligned with `NodexRendererApi` in `src/shared/nodex-renderer-api.ts`):

- **Electron:** preload → IPC → main process.
- **Web:** `nodex-web-shim` → HTTP → headless API server.

See the plan: one contract, two thin adapters.

## Sandboxing (SES)

- **`ses`**: call `lockdown()` once at startup before loading untrusted plugin code.
- **Endowments:** host `React`, mediated `fetch`, and `nodex` capabilities — **not** `document` / `window` for untrusted plugins.
- **DOM:** plugins do not touch the real DOM; they return React elements; the host mounts them.
- **Trusted system plugins** may be imported as normal modules (no compartment) for performance and DX.

Implementation: `src/renderer/shell/sandbox/sesLockdown.ts`.

## Compilation and caching (nodex-web)

- **Development:** optional runtime compile (`esbuild` / `esbuild-wasm`) for plugin sources (`ts`, `tsx`, `js`, `jsx`).
- **Production:** content-hashed bundle filenames, semver manifest (e.g. marketplace index pattern), `Cache-Control: immutable` for hashed assets.

## System plugins (product scope)

First-party modules replace legacy iframe shells:

- Minibar, command palette (existing React hosts; remain top-level).
- **Documentation** — registry scrape + UI as React views.
- **JS notebook** — `@observablehq/runtime` in a React view (no iframe).
- **Home / Welcome** — shell welcome view as React.

The **JS Notebook** shell experiment is removed in favor of the above set.

## Related files

| Area | Path |
|------|------|
| Shell view registry | `src/renderer/shell/views/ShellViewRegistry.tsx` |
| Shell host | `src/renderer/shell/views/ShellViewHost.tsx` |
| Workbench | `src/renderer/shell/ChromeOnlyWorkbench.tsx` |
| Note renderer | `src/renderer/components/renderers/NoteTypeReactRenderer.tsx` |
| Plugin UI SDK (evolving) | `packages/nodex-plugin-ui/src/index.ts` |
| Host capabilities (types) | `src/shared/plugin-host-capabilities.ts` |
| SES lockdown | `src/renderer/shell/sandbox/sesLockdown.ts` |
| Bundled docs seed | `src/core/bundled-docs-seed.ts`, `docs/bundled-plugin-authoring/` |
