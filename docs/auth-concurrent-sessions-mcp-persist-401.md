# Auth: concurrent sessions, MCP persistence, JWT TTL, 401 handling

This document records the **approved** design for multi-device refresh sessions, configurable JWT lifetimes, MCP session persistence policy, and unified client behavior on authentication failure.

## Goals

1. **Concurrent logins:** Multiple devices or clients (web, Electron, MCP) can hold valid refresh sessions for the same user without invalidating each other.
2. **MCP persistence:** Cloud MCP session tokens persist on disk until the user explicitly calls `nodex_logout` (optional: do not delete the persist file when the in-memory holder is empty—only on explicit logout).
3. **Configurable token lifetimes:** Access and refresh JWT expiries are driven by environment variables (defaults preserve previous behavior: 15m access, 30d refresh).
4. **401 after auth failure:** When the sync API returns **401** and token refresh fails, the web/Electron client clears the cloud session and sends the user to the app home (`/`).

## Server: refresh session model

### Previous behavior

- [`apps/nodex-sync-api/src/routes.ts`](apps/nodex-sync-api/src/routes.ts) stored a single `activeRefreshJti` on the user. Each new login, register, or MCP device authorization **overwrote** it, so only one refresh token remained valid.

### Target behavior

- Store **multiple** refresh JTIs per user, e.g. `refreshSessions: { jti: string; createdAt: Date }[]` on the user document (see [`apps/nodex-sync-api/src/db.ts`](apps/nodex-sync-api/src/db.ts)).
- **Login / register / MCP device authorize:** **append** a new session (new `jti`); optionally trim to `NODEX_MAX_REFRESH_SESSIONS` (default **20**, cap **100**), dropping **oldest** by `createdAt`.
- **POST `/auth/refresh`:** Verify the refresh token’s `jti` is in the user’s active set (including legacy `activeRefreshJti` for migration); **rotate** only that entry to the new `jti`.
- **Migration:** If a user has only `activeRefreshJti`, treat it as a single session until the next refresh or login, then normalize into `refreshSessions` and `$unset` `activeRefreshJti`.

Helper module (implementation): [`apps/nodex-sync-api/src/refresh-sessions.ts`](apps/nodex-sync-api/src/refresh-sessions.ts) — `appendRefreshSession`, `rotateRefreshSession`, `userHasRefreshJti`, `maxRefreshSessionsPerUser`.

[`apps/nodex-sync-api/src/mcp-device-auth-routes.ts`](apps/nodex-sync-api/src/mcp-device-auth-routes.ts) must call `appendRefreshSession` instead of `$set: { activeRefreshJti }` alone.

## Server: JWT env configuration

In [`apps/nodex-sync-api/src/auth.ts`](apps/nodex-sync-api/src/auth.ts):

- Read optional env, e.g. `NODEX_JWT_ACCESS_EXPIRES` (default `15m`) and `NODEX_JWT_REFRESH_EXPIRES` (default `30d`), passed into `signAccessToken` / `signRefreshToken`.
- Document in deploy / MCP README: longer TTL increases impact of token leakage.

## MCP package

- [`packages/nodex-mcp/src/server.ts`](packages/nodex-mcp/src/server.ts): Optionally change `persistIfNeeded` so an empty in-memory holder **does not** delete the persist file; only `nodex_logout` calls `clearPersistedMcpAuth`.
- [`packages/nodex-mcp/README.md`](packages/nodex-mcp/README.md): Update threat model and env vars as needed.

## Client: 401 + failed refresh

- [`packages/nodex-platform/src/remote-fetch.ts`](packages/nodex-platform/src/remote-fetch.ts): Extend `createFetchRemoteApi` with an optional `onSessionInvalidated` callback. When a request gets **401**, refresh fails (or retry still **401**), clear in-memory tokens + sync localStorage keys, then invoke the callback.
- [`packages/nodex-platform/src/implementations.ts`](packages/nodex-platform/src/implementations.ts): Pass `onSyncSessionInvalidated` from `CreateNodexPlatformDepsOptions`.
- [`src/renderer/store/index.ts`](src/renderer/store/index.ts): After `configureStore`, register a handler that dispatches `cloudLogoutThunk` and `window.location.replace("/")` (use a small ref indirection so `platformDeps` can be constructed before `store` exists).
- [`src/renderer/nodex-web-shim.ts`](src/renderer/nodex-web-shim.ts): For `syncWpnFetch` (and any parallel path), on refresh failure or persistent **401**, call the same invalidation helper so sync-WPN and `remote-fetch` stay aligned.

Shared helper (implementation): e.g. [`src/renderer/sync-session-invalidation.ts`](src/renderer/sync-session-invalidation.ts) with `setSyncSessionInvalidatedHandler` / `notifySyncSessionInvalidated`.

## Security note

Concurrent refresh sessions increase exposure (more valid refresh tokens at once). Mitigate with `NODEX_MAX_REFRESH_SESSIONS`, conservative production TTLs, and optional future “sign out everywhere” support.

## Testing

- **sync-api:** Two logins for the same user → both refresh tokens work; refresh rotates only the used session; session cap evicts oldest; MCP device flow adds a session without killing an existing web refresh token.
- **Client:** Mocked **401** + failed refresh triggers handler (where the test harness allows).

## Status

**Approved** by product owner. Implementation should follow this document and the Cursor plan `auth_concurrent_mcp_persist` (see `.cursor/plans/` if present).
