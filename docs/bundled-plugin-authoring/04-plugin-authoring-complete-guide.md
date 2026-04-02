# Plugin authoring — complete guide

This guide explains how to extend Nodex with new behavior and UI. It complements the shorter bundled pages **Overview**, **Shell registration and commands**, and **Minimal code example** in the same folder.

---

## 1. Two kinds of plugins

Nodex uses two authoring paths. Pick one before you write code.

| Path | Location | When to use |
|------|----------|-------------|
| **First-party (shell)** | Source under `src/renderer/shell/first-party/plugins/` | Features shipped inside the app (same repo, full TypeScript and React). |
| **Packaged plugin** | `.nodexplugin` / ZIP with `manifest.json` + entry file | Installable note renderers or hybrid packages; loaded from user or marketplace directories. |

**First-party** plugins register React views, tabs, rail items, and commands through **renderer registries** (no iframe for the main Chrome workbench). **Packaged** plugins are loaded by the main process; their `activate` function receives a narrow **`Nodex` API** (for classic note UI registration) and may ship separate UI bundles depending on `manifest.json` `type`.

Repository architecture notes: `claude-docs/architecture/modular-plugins-architecture.md` and `claude-docs/architecture/plugin-types.md`.

---

## 2. First-party plugins (step by step)

### 2.1 What you can contribute

- **Shell views** — React components in regions such as `mainArea`, `primarySidebar`, `secondaryArea`.
- **Tab types** — Associate a tab with a main-column `viewId` (and optional sidebar companions via tab metadata).
- **Menu rail** — Activity bar entries that open tabs and optional side panels.
- **App menu** — Extra menu entries (see existing plugins for patterns).
- **Commands** — Command palette and minibuffer entries (`NodexContributionRegistry`).
- **Note type editors** — `registerNoteTypeReactEditor(noteType, Component)` for workspace notes of a given `type`.
- **Mode line** — Bottom status segments via `registerModeLineItem`.

### 2.2 File layout

Create a folder:

```text
src/renderer/shell/first-party/plugins/<your-feature>/
  YourMainView.tsx
  useRegisterYourFeaturePlugin.ts   # or .tsx
```

Optional: split sidebars, hooks, and types into additional files following existing plugins (Documentation, Notes Explorer, Observable notebook).

### 2.3 Registration hook pattern

Export a hook named like `useRegisterYourFeaturePlugin`. Inside **`useEffect`**:

1. Collect **dispose** functions from each registration.
2. Return a cleanup that runs every dispose.

Use these React contexts (same module paths as other first-party plugins):

| Hook | Purpose |
|------|---------|
| `useShellViewRegistry()` | `registerView({ id, title, defaultRegion, component, capabilities })` |
| `useShellRegistries()` | `tabs`, `menuRail`, `appMenu`, … |
| `useNodexContributionRegistry()` | `registerCommand`, `registerNoteTypeReactEditor`, `registerModeLineItem` |

**Capabilities** on views control how tightly the shell locks down command access; mirror an existing plugin (`allowedCommands`, `readContext`).

### 2.4 Wire-up in the app

Call your hook from `src/renderer/App.tsx` alongside the other `useRegister…Plugin()` calls. The shell providers must wrap the tree (already true in this app).

### 2.5 Minimal “Hello World” (functional component)

**View component** (`HelloWorldView.tsx`):

```tsx
import React from "react";

export function HelloWorldView(): React.ReactElement {
  return (
    <div className="p-4 text-[13px]">
      Hello, world
    </div>
  );
}
```

**Registration** (`useRegisterHelloWorldPlugin.ts`):

```tsx
import { useEffect } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { HelloWorldView } from "./HelloWorldView";

const PLUGIN_ID = "plugin.helloworld";
const VIEW_MAIN = "plugin.helloworld.main";
const TAB = "plugin.helloworld.tab";

export function useRegisterHelloWorldPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_MAIN,
        title: "Hello World",
        defaultRegion: "mainArea",
        component: HelloWorldView,
        capabilities: {
          allowedCommands: "allShellCommands",
          readContext: true,
        },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB,
        title: "Hello World",
        order: 99,
        viewId: VIEW_MAIN,
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.helloworld.open",
        title: "Hello World: Open",
        category: "Hello World",
        sourcePluginId: PLUGIN_ID,
        handler: () => {
          regs.tabs.openOrReuseTab(TAB, {
            title: "Hello World",
            reuseKey: "plugin:helloworld",
          });
          views.openView(VIEW_MAIN, "mainArea");
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}
```

Paths above assume the hook lives in `src/renderer/shell/first-party/plugins/<name>/` (three levels up to `shell/`). If you nest deeper, add more `../` segments (see `useRegisterDocumentationPlugin.ts`).

Optional: add **`regs.menuRail.registerItem`** so the activity rail opens the same tab and sidebar (see **Shell registration and commands** bundled page).

### 2.6 Talking to the host from React

Use **`window.Nodex`** in the renderer. Its TypeScript contract is **`NodexRendererApi`** in `src/shared/nodex-renderer-api.ts` (notes, project, plugins, assets, shell layout, workspace APIs, plugin IDE helpers, etc.). The package **`@nodex/shell-ui` / `nodex-plugin-ui`** exposes **`useHostNodex()`** as a small wrapper around `window.Nodex` for first-party code.

Do **not** rely on Node `fs`, raw SQLite, or unmediated `fetch` from sandboxed plugin code; use the host API (see section 4).

### 2.7 Examples to read in the repo

| Plugin | Path |
|--------|------|
| Documentation (rail, sidebars, commands) | `src/renderer/shell/first-party/plugins/documentation/useRegisterDocumentationPlugin.ts` |
| Notes Explorer | `src/renderer/shell/first-party/plugins/notes-explorer/useRegisterNotesExplorerPlugin.ts` |
| Markdown note editor | `src/renderer/shell/first-party/plugins/markdown/useRegisterMarkdownNotePlugin.tsx` |
| Observable notebook | `src/renderer/shell/first-party/plugins/observable-notebook/useRegisterObservableNotebookPlugin.ts` |
| Rail click behavior | `src/renderer/shell/shellRailNavigation.ts` |
| Contribution registry implementation | `src/renderer/shell/nodex-contribution-registry.ts` |

---

## 3. Packaged plugins (ZIP / marketplace)

### 3.1 Layout

Each package typically includes:

```text
<plugin-name>/
  manifest.json
  <entry file from manifest.main, often index.js>
```

### 3.2 Manifest essentials

The full shape is **`PluginManifest`** in `src/core/plugin-loader-types.ts`. Important fields include:

- **`name`**, **`version`**, **`main`**, **`type`** (`ui` | `backend` | `hybrid`), **`mode`** (`development` | `production`).
- Optional: **`noteTypes`**, **`permissions`**, **`ui`**, **`theme`**, **`hostTier`** (bundled roots only).

**`hostTier`** (`system` | `core` | `user`) controls visibility in the Plugins UI and in “new note” type pickers. User-installed plugins are always treated as **user** tier for security. Details: `claude-docs/architecture/plugin-types.md`.

### 3.3 `activate` in the main process

The loader **`require`s** your main file and calls **`activate`** with an API object. The classic surface includes **`registerNoteRenderer`** / note UI registration (see `src/core/plugin-loader-registry.ts`). The minimal **typed** legacy shape is **`NodexAPI`** in `plugin-loader-types.ts` (`Nodex.ui.registerComponent` for string-based component registration).

End-user oriented overview and ZIP tips: **`PLUGIN_SYSTEM.md`** at the repo root.

### 3.4 Legacy iframe note UI

Sandboxed iframes receive globals described in **`src/shared/plugin-api.d.ts`** (`window.Nodex.React`, `postMessage`, `saveNoteContent`, asset helpers, etc.). New note editing in the shell increasingly uses **React hosts** and **`NoteTypeReactRenderer`** instead of iframes; prefer first-party or host-integrated React editors when you control the repo.

---

## 4. API and SDK summary

| Surface | Role |
|---------|------|
| **`NodexRendererApi`** (`src/shared/nodex-renderer-api.ts`) | Full **`window.Nodex`** contract: notes, WPN/workspace, plugins, assets, shell layout, IDE operations. Backed by IPC (Electron) or HTTP (web shim). |
| **`NodexAPI`** (`plugin-loader-types.ts`) | Main-process **`activate`** API for packaged plugins (narrow; includes `ui.registerComponent`). |
| **`PluginHostCapabilities`** (`src/shared/plugin-host-capabilities.ts`) | Intended sandbox contract: `nodex`, mediated `fetch`, `apiVersion`. |
| **`NodexContributionRegistry`** | In-process commands, mode line, React note-type editors (first-party / shell). |
| **`nodex-plugin-ui`** | `useHostNodex`, `definePlugin`, types for declarative plugin modules. |

---

## 5. Bundled documentation in this app

Markdown files under **`docs/bundled-plugin-authoring/`** are listed in **`manifest.json`**. On workspace bootstrap (and when the API server starts with a project), the app **seeds** them as notes with **`bundledDoc: true`**. The Documentation shell shows them under **Nodex — Plugin authoring (bundled)**.

Override the directory with environment variable **`NODEX_BUNDLED_DOCS_DIR`** if needed. Implementation: **`src/core/bundled-docs-seed.ts`**.

---

## 6. Checklist

**First-party feature**

- [ ] New folder under `first-party/plugins/`.
- [ ] `useRegister…Plugin` with `useEffect` cleanup.
- [ ] Views / tabs / rail / commands / note editor as needed.
- [ ] Hook invoked from `App.tsx`.
- [ ] Host calls via `window.Nodex` or `useHostNodex()`.

**Packaged plugin**

- [ ] Valid **`manifest.json`** and entry module with **`activate`**.
- [ ] Correct **`type`** / **`mode`** for your build.
- [ ] Understand **`hostTier`** if shipping under bundled **`plugins/core`**.
- [ ] Test install via Plugin Manager or dev plugin path.

For command IDs and rail ordering, stay consistent with existing plugins and prefer stable, namespaced identifiers (e.g. `nodex.<area>.<action>`).
