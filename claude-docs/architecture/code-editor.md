# Code editor (Plugin IDE) — UX and plumbing

## Shell layout (primary sidebar + editor column)

- **Plugin picker** lives in the left **Plugins** tree: one row per workspace folder. Expand a row to lazy-load files (`listPluginSourceFiles`); click the folder name to focus that workspace; click a file to open it (cross-workspace opens switch workspace then open).
- **Menus** (File / Edit / Build) stay in the sidebar strip; the editor column header shows **Plugin IDE** only (no duplicate workspace label or header `<select>`).
- **Dependencies** strip is always visible (not collapsed behind `<details>`). Primary actions are **icon-first** with `title` / `aria-label` (typecheck, npm install). Checkboxes keep text labels (devDependency, typecheck on save, **format on save**, reload on save).
- **Keyboard shortcuts** for the editor are documented under **Settings → Keyboard shortcuts**, not in the IDE header.

## Prettier (format on save)

- Toggle **Format on save (Prettier)** in the dependencies strip; preference is stored in `localStorage`.
- On save (active file and save-all), the IDE reads **`.prettierrc.json`** or **`.prettierrc`** from the active plugin workspace via `readPluginSourceFile` and merges with parser/plugins for the file extension. Unsupported or failed format paths log via `clientLog` and save the original content.

## Global toasts

- **ToastProvider** wraps the app (with the theme); **top-center**, small font, **5s** auto-dismiss; timer **resets** when a new line merges into the same toast (`mergeKey` + `severity`).
- **Copy** copies the full toast text; **Dismiss** clears immediately.
- **Plugin IDE** mirrors `status` strings into toasts (heuristic severity from wording).
- **NoteViewer** shows a **warning** toast when no plugin is registered for the note’s type (`mergeKey` per type).

## Logging

- **Renderer** — `clientLog({ component, message, level?, noteId?, noteTitle? })` in [`src/renderer/logging/clientLog.ts`](../../src/renderer/logging/clientLog.ts): logs to DevTools as `ISO [Renderer:Component] …` and sends **`NODEX_CLIENT_LOG`** to main.
- **Main** — [`ingestRendererStructuredLog`](../../src/main/main-process-debug-log.ts) appends the same structured line to the **debug dock buffer**, **original Node console** (bypassing the patched `console` to avoid double capture), and the **daily file** under `userData/logs/nodex-YYYY-MM-DD.log`.
- **Main `console.*`** — tapped lines are prefixed `ISO [Main:console.level]` and also appended to the daily log.

## Bridge events (shell ↔ PluginIDE)

| Event | Role |
|--------|------|
| `IDE_SHELL_STATE_EVENT` | PluginIDE → sidebar: `folders[]` with lazy `fileList`, active plugin, busy, dirty count, etc. |
| `IDE_SHELL_PLUGIN_EVENT` | Sidebar → PluginIDE: focus workspace |
| `IDE_SHELL_OPEN_FILE_EVENT` | Open path; detail can be `string` or `{ pluginFolder, relativePath }` |
| `IDE_SHELL_EXPAND_FOLDER_EVENT` | Sidebar → PluginIDE: load file list for a folder |
| `IDE_SHELL_ACTION_EVENT` | Menu actions (save, bundle, …) |

Types and dispatch helpers: [`src/renderer/plugin-ide/ideShellBridge.ts`](../../src/renderer/plugin-ide/ideShellBridge.ts).
