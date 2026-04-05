# Shell registration and commands

## Registration hook

First-party plugins typically export `useRegisterMyPlugin()` and call it from `App.tsx` inside the shell providers:

```tsx
// src/renderer/App.tsx (pattern)
useRegisterDocumentationPlugin();
useRegisterJsNotebookPlugin();
```

Inside the hook, use `useEffect` to register views, tabs, rail items, and commands, and return a cleanup that disposes each registration.

## Menu rail + tabs

`ShellMenuRailRegistry` items can reference:

- `tabTypeId` + `tabReuseKey` — opens or focuses a tab.
- `sidebarViewId` / `secondaryViewId` — opens companion panels when using rail-driven navigation.
- `commandId` — runs a command instead of opening a tab.

`ShellTabsRegistry.registerTabType` maps a tab type to a `viewId` (main column). Companion side regions can be driven from tab metadata (see architecture doc *Tab-scoped shell companions*).

## Commands

```ts
contrib.registerCommand({
  id: "my.plugin.action",
  title: "My plugin: Do something",
  category: "Plugins",
  sourcePluginId: "my.plugin",
  handler: () => {
    /* ... */
  },
});
```

Prefer stable `id` strings; titles appear in the command palette.

## Files to study in this repo

- `src/renderer/shell/first-party/plugins/documentation/useRegisterDocumentationPlugin.ts` — rail + sidebar + secondary + tab.
- `src/renderer/shell/shellRailNavigation.ts` — shared rail click behavior.
- `src/renderer/shell/registries/ShellMenuRailRegistry.ts` — rail item shape.
