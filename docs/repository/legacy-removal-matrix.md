# Legacy stacks matrix (Electron + web)

This document inventories **Track A** (flat `legacy` tree in `nodex-workspace.json` + `notes-store`) and **Track B** (removed headless Express on port 3847).

| Surface | Primary path today | Legacy / dual path | Env / flag |
|--------|--------------------|--------------------|------------|
| Electron file vault — workspace JSON | Main `WorkspaceStore` + `nodex-workspace.json` | `legacy` slot + in-memory `notes-store` for flat tree | `NODEX_WPN_ONLY_FILE_VAULT=1` skips persisting `legacy` |
| Electron file vault — note IPC | WPN first, then flat (`register-static-ipc-notes-registry.ts`, `register-run-app-ready-notes-ipc.ts`) | Flat fallbacks when note not in WPN rows | Same flag: flat fallbacks throw / are skipped |
| Project open | `bootstrapWorkspaceNotes` | Loads `slot.legacy` into memory | `NODEX_MIGRATE_LEGACY_FLAT_TO_WPN=0` disables auto **legacy → WPN** import |
| Web — WPN / auth | `apps/nodex-sync-api` (Fastify + Mongo) | _(removed)_ Express `:3847` | `NEXT_PUBLIC_NODEX_WEB_BACKEND=sync-only` (see `npm run dev:web`) |
| Docker | Gateway + sync-api + web images | _(removed)_ `nodex-api` service | Default stack only |

**Scratch / cloud (not “legacy flat”):** IndexedDB scratch WPN and Electron cloud windows use different backends; do not conflate with `legacy` slot removal.
