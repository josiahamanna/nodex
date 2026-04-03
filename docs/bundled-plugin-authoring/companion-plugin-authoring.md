## How to create plugins

Plugins extend the shell (activity bar, sidebar column, primary tabs, companion column) and can register commands for the palette and minibuffer. **System plugins** ship inside the app as normal TypeScript modules; **user plugins** use the same conceptual API and will load from compiled bundles under a SES sandbox (see repo docs).

### Tab companions and in-app docs

- **Tab types** can set optional `primarySidebarViewId` and `secondaryViewId` so the workbench opens or closes the sidebar and companion columns when you switch main tabs (no stale explorer next to unrelated tabs).
- **Markdown editing** for `markdown` / `root` is provided by the bundled `useRegisterMarkdownNotePlugin` hook, which registers editors on the contribution registry (minimal shell chrome, no rail or extra tabs).
- **Long-form guides** ship as markdown files under `docs/bundled-plugin-authoring/`, seeded into the notes DB on startup. Open the Documentation tab → sidebar **Guides** → **Plugin authoring** for read-only rendered copies; this companion panel is the same content from the database.

### 1. UI vs non-UI

- **UI plugin** — contributes one or more `React` views registered on `ShellViewRegistry`, plus optional rail items and tab types.
- **Non-UI (or hybrid)** — registers `commands` only (e.g. palette actions) with no extra views, or combines commands with views.

### 2. Shell regions (where views mount)

| Region | Role |
|--------|------|
| `primarySidebar` | Left panel body (beside the rail) |
| `mainArea` | Primary editor column (follows active tab) |
| `companion` | Right/auxiliary column |
| `bottomArea` | Bottom dock (optional) |

### 3. Register a hook from the app shell

First-party plugins use a `useRegister…Plugin()` hook called once from the shell bootstrap (same pattern as Documentation and Observable). Inside `useEffect`, register views, tab types, rail items, and commands; return a cleanup that disposes all disposers.

```typescript
// useRegisterMyFeaturePlugin.ts
import { useEffect } from "react";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../views/ShellViewContext";
import { useNodexContributionRegistry } from "../NodexContributionContext";
import { MyMainView } from "./MyMainView";
import { MySidebarView } from "./MySidebarView";

const VIEW_MAIN = "plugin.myfeature.main";
const VIEW_SIDE = "plugin.myfeature.sidebar";
const TAB_MY = "plugin.myfeature.tab";
const PLUGIN_ID = "plugin.myfeature";

export function useRegisterMyFeaturePlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_MAIN,
        title: "My feature",
        defaultRegion: "mainArea",
        component: MyMainView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
      views.registerView({
        id: VIEW_SIDE,
        title: "My feature — tools",
        defaultRegion: "primarySidebar",
        component: MySidebarView,
        capabilities: { allowedCommands: "allShellCommands", readContext: false },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_MY,
        title: "My feature",
        order: 50,
        viewId: VIEW_MAIN,
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.myfeature.rail",
        title: "My feature",
        icon: "★",
        order: 50,
        tabTypeId: TAB_MY,
        sidebarViewId: VIEW_SIDE,
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.myfeature.open",
        title: "My feature: Open",
        category: "My feature",
        sourcePluginId: PLUGIN_ID,
        doc: "Opens My feature in a new tab with the tools sidebar.",
        api: {
          summary: "Open My feature (tab + sidebar).",
          args: [],
          exampleInvoke: {},
          returns: { type: "void", description: "Updates shell layout." },
        },
        handler: () => {
          regs.tabs.openTab(TAB_MY, "My feature");
          views.openView(VIEW_SIDE, "primarySidebar");
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}
```

### 4. View component shape

Shell views receive `viewId` and `title`. Use hooks for registries and `window.Nodex` / `window.nodex.shell` as needed.

```typescript
// MyMainView.tsx
import React from "react";
import type { ShellViewComponentProps } from "../../views/ShellViewRegistry";

export function MyMainView({ viewId, title }: ShellViewComponentProps): React.ReactElement {
  return (
    <div className="p-4 text-[13px]">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground">View id: {viewId}</p>
    </div>
  );
}
```

### 5. Commands, prose docs, and API contract

Set `sourcePluginId` and `doc` on every command. Add an `api` object so the Documentation primary view can show namespace, argument table, generated JSON Schema, example invoke envelope, and return type: `summary`, `details`, `args` (name, type, required, description, optional `schema` per field), `exampleInvoke`, and `returns`. Use `args: []` when there are no parameters.

Optional: register keybindings via `ShellKeymapRegistry` where your feature registers.

### 6. Author SDK (`@nodex/plugin-ui`)

For packaged plugin modules, authors describe a single module with `definePlugin()`: slot components, command metadata, and note types. The host compiles `ts/tsx/js/jsx` and (for untrusted code) evaluates inside SES with mediated `fetch` and host file APIs only — no direct DOM.

```typescript
import { definePlugin } from "@nodex/plugin-ui";
import * as React from "react";

function RailWidget() {
  return React.createElement("span", null, "Hi");
}

export default definePlugin({
  id: "com.example.hello",
  version: "1.0.0",
  slots: { rail: RailWidget },
  commands: [
    {
      id: "hello.say",
      title: "Hello: Say hi",
      category: "Hello",
      doc: "Sample command.",
      sourcePluginId: "com.example.hello",
    },
  ],
});
```

Loading user bundles into the live registries is orchestrated by the host (manifest + hashed entry URL in production). System plugins in this repo use the hook pattern above instead.

### 7. Host API (Electron vs web)

Use `window.Nodex` for project/note/file operations (preload IPC in Electron, HTTP shim on web). Do not import Node `fs` or SQLite in renderer plugin code. See `src/shared/nodex-renderer-api.ts` and `plugin-host-capabilities.ts` in the repo.

### 8. Checklist

1. Unique view ids and tab type id; stable plugin id string.
2. `registerView` for each region you use.
3. `registerTabType` if the main column should follow a tab.
4. Rail: `tabTypeId` (+ optional `sidebarViewId` / `secondaryViewId`) or `commandId`.
5. Register the hook from the shell app entry alongside other plugins.

---

**Repo reference:** `claude-docs/architecture/modular-plugins-architecture.md` — high-level architecture.
