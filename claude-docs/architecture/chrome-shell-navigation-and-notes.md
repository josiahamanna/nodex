# Chrome shell navigation, tabs, URLs, and notes

This document describes the **Chrome-only workbench** (`ChromeOnlyWorkbench`) in the renderer shell: how rail clicks, commands, and Welcome links stay consistent, how tabs are reused and reordered, how the address **hash** reflects the active tab, and how **notes** open in the shell (editor + Notes Explorer).

## Entry points

- **Workbench UI:** [`src/renderer/shell/ChromeOnlyWorkbench.tsx`](../../src/renderer/shell/ChromeOnlyWorkbench.tsx)
- **Shared rail logic:** [`src/renderer/shell/shellRailNavigation.ts`](../../src/renderer/shell/shellRailNavigation.ts) (`runShellMenuRailAction`)
- **React hook:** [`src/renderer/shell/useShellNavigation.ts`](../../src/renderer/shell/useShellNavigation.ts) (`openFromRailItem`, `openNoteById`, `invokeCommand`)
- **Early `window.nodex.shell`:** [`src/renderer/shell/NodexContributionContext.tsx`](../../src/renderer/shell/NodexContributionContext.tsx) runs `exposeDevtoolsShellApi` in **`useLayoutEffect`** so Welcome links and DevTools see the API before paint.
- **Tab registry:** [`src/renderer/shell/registries/ShellTabsRegistry.ts`](../../src/renderer/shell/registries/ShellTabsRegistry.ts) — `openTab`, **`openOrReuseTab`**, **`reuseKey`**, **`reorderTabs`**, `closeTab`.
- **Active tab for main views:** [`src/renderer/shell/ShellActiveTabContext.tsx`](../../src/renderer/shell/ShellActiveTabContext.tsx) — provided from [`ShellViewHost`](../../src/renderer/shell/views/ShellViewHost.tsx) when rendering the **main** column (`activeMainTab` prop).
- **URL hash:** [`src/renderer/shell/shellTabUrlSync.ts`](../../src/renderer/shell/shellTabUrlSync.ts) — `parseShellHash`, `hashForActiveTab`, `replaceWindowHash`.
- **Open note:** [`src/renderer/shell/openNoteInShell.ts`](../../src/renderer/shell/openNoteInShell.ts) — opens explorer sidebar + note tab + `fetchNote` via Redux store.
- **Workspace roots (multi-root):** [`src/renderer/shell/useShellProjectWorkspace.ts`](../../src/renderer/shell/useShellProjectWorkspace.ts)

## Tab reuse and rail metadata

- **`ShellTabInstance.reuseKey`:** When `openOrReuseTab(tabTypeId, { reuseKey })` finds an existing instance with the same type and key, it **activates** it and optionally updates `title` / `state`.
- **Menu rail:** [`ShellMenuRailRegistry`](../../src/renderer/shell/registries/ShellMenuRailRegistry.ts) items may set **`tabReuseKey`** so repeated rail clicks do not spawn duplicate tabs.
- **Tab-scoped companions:** [`ShellTabType`](../../src/renderer/shell/registries/ShellTabsRegistry.ts) may declare optional **`primarySidebarViewId`** and **`secondaryViewId`**. When the active main tab changes, [`ChromeOnlyWorkbench`](../../src/renderer/shell/ChromeOnlyWorkbench.tsx) syncs those regions: defined ids open the corresponding shell view and expand layout flags; omitted fields **close** the region and collapse **sidebar** / **companion** chrome (so e.g. Observable no longer leaves the Notes tree visible).
- **Commands** for Documentation, Observable, and Notes Explorer open tabs; sidebar/companion visibility follows tab type companions (see `useRegister*Plugin` under `src/renderer/shell/first-party/plugins/`).

## URL hash semantics

- **Note tab:** `#note/<noteId>` when the active tab is the shell note editor (`shell.tab.note`) with `state.noteId`.
- **Other tabs:** `#/t/<instanceId>` for a stable per-tab bookmark.
- **Sync:** Subscribing to `ShellTabsRegistry` updates the hash with **`history.replaceState`** when the active tab changes (see `ChromeOnlyWorkbench`). **`hashchange`** re-applies navigation (open note or activate instance).
- **Initial load:** A short delayed pass reads the hash once so plugin registration can finish first.

## Notes in the shell

- **Tab / view ids:** [`src/renderer/shell/first-party/shellWorkspaceIds.ts`](../../src/renderer/shell/first-party/shellWorkspaceIds.ts)
- **System markdown note plugin:** [`useRegisterMarkdownNotePlugin`](../../src/renderer/shell/first-party/plugins/markdown/useRegisterMarkdownNotePlugin.tsx) registers React editors for **`markdown`** and **`root`** on [`NodexContributionRegistry`](../../src/renderer/shell/nodex-contribution-registry.ts) (`registerNoteTypeReactEditor`). [`NoteTypeReactRenderer`](../../src/renderer/components/renderers/NoteTypeReactRenderer.tsx) resolves the registry first, then built-in editors for other types.
- **Bundled documentation:** Repo markdown under [`docs/bundled-plugin-authoring/`](../../docs/bundled-plugin-authoring/) is seeded into the notes DB on startup ([`seedBundledDocumentationNotesFromDir`](../../src/core/bundled-docs-seed.ts)); the Documentation shell lists those notes in the sidebar **Guides** tab and renders them read-only in the main column ([`DocumentationHubView`](../../src/renderer/shell/first-party/plugins/documentation/DocumentationHubView.tsx)).
- **Note editor view:** [`NoteEditorShellView`](../../src/renderer/shell/first-party/NoteEditorShellView.tsx) — reads `useShellActiveMainTab()`, dispatches `fetchNote`, renders [`NoteViewer`](../../src/renderer/components/NoteViewer.tsx).
- **Registration:** [`useRegisterNotesShellPlugin`](../../src/renderer/shell/first-party/useRegisterNotesShellPlugin.ts) — tab type `shell.tab.note`, command **`nodex.notes.open`** with `{ noteId }`.
- **Notes Explorer:** [`useRegisterNotesExplorerPlugin`](../../src/renderer/shell/first-party/plugins/notes-explorer/useRegisterNotesExplorerPlugin.ts) — sidebar [`NotesExplorerPanelView`](../../src/renderer/shell/first-party/plugins/notes-explorer/NotesExplorerPanelView.tsx) wraps [`NotesSidebarPanel`](../../src/renderer/components/NotesSidebarPanel.tsx) with **`prefixNoteTitleWithType`** (`[type] title`). Handlers live in [`useNotesExplorerShellHandlers`](../../src/renderer/shell/first-party/plugins/notes-explorer/useNotesExplorerShellHandlers.ts) (Redux + `window.Nodex`).

## Tab strip UX

- **Close:** Each tab has a close control; closing the **last** tab re-opens **Welcome** (`openOrReuseTab` with `reuseKey: shell:welcome`).
- **Reorder:** Horizontal **drag-and-drop** via `@dnd-kit` with **`restrictToHorizontalAxis`**, calling `tabs.reorderTabs(from, to)`.

## Dependencies and caveats

- **Redux:** Note flows assume the app root provides **`react-redux` `Provider`** (e.g. [`apps/nodex-web/app/client-shell.tsx`](../../apps/nodex-web/app/client-shell.tsx)).
- **Hash loops:** URL updates compare the current hash before writing; prefer **`replaceState`** for tab switches so back/forward behavior stays predictable (document product choice if you switch to `pushState`).
- **Living doc:** Update this file when changing hash format, `reuseKey` conventions, or public command ids.
