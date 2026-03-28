# Build MVP
Follow this [Windsurf rules](./electron_windsurf_best_practices.md)
Check this [architecture document](./minimum-poc-architecture.md) for more understanding
## create electron application

Create an electron application in the current working directory.

``` bash
npx create-electron-app@latest . --template=webpack-typescript
```

## Basic electron app

Make sure of a basic running electron application.
Please use React, Shadcn, tailwindcss, Redux.

## Hardcoded note display

1. Add IPC handler in main.js that returns hardcoded note
2. Add preload.js to expose IPC
3. Update renderer/app.js to fetch and display note.content as plain text
4. Test: Note content appears in window

 -Use tiptap for text note
 -Use monaco editor for code note

## Plugin loader + registry

1. Create core/plugin-loader.js
2. Create core/registry.js
3. Create plugins/markdown-note/ with manifest + index.js
4. Load plugin in main.js on startup
5. Test: Console logs show plugin registered

## Dynamic rendering

1. Update IPC to expose `get-component`
2. Update renderer to fetch component code
3. Execute component code with `new Function()`
4. Render result to DOM
5. Test: Markdown renders as HTML

## Hot reload

1. Add file watcher in main.js for plugins/
2. On change, reload plugin and update registry
3. Emit event to renderer to re-render
4. Test: Edit plugin file, see changes without restart
