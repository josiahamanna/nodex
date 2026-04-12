# Headless Express parity checklist (Track B, Phase 1B)

The **headless Express** package has been **removed** from the repository. This checklist remains as a **sign-off** that your SKU no longer depends on it.

- [x] Web sign-in / refresh / `authMe` work against **sync-api** only.
- [x] WPN CRUD (workspaces, projects, notes, explorer) work via **sync-api** `/wpn/*` from the browser.
- [x] Shell layout persist (`getShellLayout` / `setShellLayout`) uses **sync-api** when in sync-only mode.
- [x] Assets and plugin flows you rely on are covered by **sync-api**, Electron IPC, or an explicit stub.
- [x] No CI script or e2e flow **requires** `npx tsx src/nodex-api-server/server.ts` (server removed).
- [x] Operators have a documented path: **Mongo + sync-api** (see `docs/deploy-nodex-sync.md`) or **Electron only** for local folders.
