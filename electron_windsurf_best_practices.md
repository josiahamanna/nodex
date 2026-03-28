# Electron App Best Practices (Windsurf-Oriented)

## Must follow vscode architecture rendering views and node processes.

## vscode architecture for security.

## must follow vscode architecure for plugin management.
- plugin must have it own code base, build system and tooling to produce the zip bundle.
- set a standard for that and document.


## Security & Process Isolation

-   Set `contextIsolation: true` and `nodeIntegration: false` in
    `webPreferences`.
-   Use `preload.js` scripts to expose secure APIs via
    `contextBridge.exposeInMainWorld`.
-   Disable the `remote` module to prevent renderer-to-main process
    privilege escalation.
-   Enable `sandbox: true` wherever possible for stronger isolation.
-   Use a strict Content Security Policy (CSP) to prevent XSS and
    injection attacks.

## IPC Communication

-   Strictly define IPC channels in a shared constants file.
-   Use `ipcMain.handle` and `ipcRenderer.invoke` for structured async
    communication.
-   Never expose raw IPC access directly to the renderer.
-   Validate and sanitize all IPC payloads.

## Code Structure & Safety

-   Explicitly forbid `eval()` or injecting raw strings into the DOM.
-   Always validate data coming from the renderer in the main process.
-   Use TypeScript for stronger type safety across processes.
-   Separate concerns: main process, preload, and renderer should have
    clear boundaries.
-   Avoid large monolithic files---modularize aggressively.

## Windsurf Agent Management

-   Use `@filename` to explicitly context-shift between `main.js`,
    `preload.js`, and renderer files.
-   Apply `@rules` to prevent unauthorized dependency updates.
-   Define guardrails for AI edits (e.g., no security config changes
    without approval).
-   Maintain a clear plugin interface contract if using plugin-based
    architecture.

## Performance

-   Use Electron Forge for build standardization and packaging.
-   Lazy-load heavy modules in the renderer.
-   Avoid blocking the main process---offload work to workers where
    possible.
-   Use `BrowserWindow` options like `show: false` and display when
    ready.

## Additional Best Practices

### Dependency & Supply Chain Security

-   Regularly audit dependencies (`npm audit`, `pnpm audit`).
-   Pin versions using lockfiles.
-   Avoid unnecessary dependencies.

### Logging & Debugging

-   Implement structured logging (e.g., winston, pino).
-   Separate dev vs production logging levels.
-   Capture crashes using Electron's crashReporter.

### Auto Updates

-   Use secure auto-update mechanisms (e.g., electron-updater).
-   Sign builds to ensure authenticity.

### Packaging & Distribution

-   Code sign applications for macOS and Windows.
-   Minimize bundle size using tree shaking and bundlers.

### UI/UX Stability

-   Avoid unnecessary re-renders in the renderer process.
-   Use efficient state management.
-   Gracefully handle errors and edge cases.

### Testing

-   Use end-to-end testing (e.g., Playwright).
-   Unit test preload and IPC logic.
-   Mock Electron APIs for isolated testing.

### Plugin Architecture (if applicable)

-   Define a strict plugin API boundary.
-   Run plugins in isolated contexts if possible.
-   Validate plugin inputs and outputs rigorously.

------------------------------------------------------------------------

This document serves as a baseline for building secure, maintainable,
and scalable Electron applications using Windsurf workflows.
