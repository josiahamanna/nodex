# @nodex-studio/mcp

stdio [Model Context Protocol](https://modelcontextprotocol.io) server for **Nodex** workspace/project/note (WPN) data. It calls the same HTTP JSON API as the web client:

- **Cloud:** `nodex-sync-api` or Next colocated `/api/v1` (Mongo WPN + JWT).
- **Local:** Electron **loopback** bridge on `127.0.0.1` (file vault), enabled with `NODEX_WPN_LOCAL_HTTP=1`.

## Tools

| Tool | Purpose |
|------|---------|
| `nodex_find_projects` | Find by project **name or UUID**; optional `workspaceQuery`. Returns `status` + `matches` with `path` `Workspace / Project`; `ambiguous` / `workspace_ambiguous` list all candidates. |
| `nodex_find_notes` | Find by note **title or UUID**; optional `workspaceQuery` / `projectQuery`. Returns `path` `Workspace / Project / Title`; `ambiguous`, `workspace_ambiguous`, `project_ambiguous` as needed. |
| `nodex_list_wpn` | `scope`: `workspaces` \| `projects`+`workspaceId` \| `notes`+`projectId` \| `full_tree` — same data as GET `/wpn/workspaces`, `/wpn/workspaces/…/projects`, `/wpn/projects/…/notes`. |
| `nodex_resolve_note` | Match `workspaceName` + `projectName` + `noteTitle` (trim, case-insensitive) → canonical `noteId`. Errors with `candidates` if ambiguous. |
| `nodex_get_note` | `GET /wpn/notes/:id` — full note including `content`. |
| `nodex_get_note_title` | Same GET as `nodex_get_note` but returns only `{ noteId, title }` (lighter context for rename flows). |
| `nodex_note_rename` | `PATCH /wpn/notes/:id` with `{ title }` only. Duplicate title under the same parent → tool error with `Note title already exists. Try a different title.` (HTTP **409** from API). |
| `nodex_execute_note` | `noteQuery` (title or UUID) + optional `workspaceQuery` / `projectQuery`. Uses the same resolution as `nodex_find_notes`; if **unique**, returns full `note` for the agent to follow `content`. If **ambiguous** / scope errors, returns candidates with **path** and **noteId** so the user can pick; then call again with the chosen UUID (or narrower filters). |
| `nodex_write_note` | Discriminated `mode`: `patch_existing`, `create_root`, `create_child`, `create_sibling` (maps to `PATCH` / `POST` WPN routes). `patch_existing` with `title` uses the same duplicate-title rules as `nodex_note_rename`. |
| `nodex_create_child_note` | Create a **direct child** under a parent from `parentNoteId`, or `workspaceName`+`projectName`+`parentPathTitles` (root→parent title chain in the project tree), or `parentWpnPath` (`"Workspace / Project / Title / …"` split on ` / `). Returns project/path ambiguity JSON like other tools when resolution fails. |
| `nodex_write_back_child` | After work scoped to a task note: `taskNoteId` + `title` + `content` → new **direct child** of that note (loads `projectId` via `GET /wpn/notes/:id`, then `POST` child). |
| `nodex_login` | Cloud **session** mode only (`NODEX_MCP_CLOUD_SESSION=1`): `email` + `password` → stores JWT in-process and on disk (see below). Passwords may appear in host logs. |
| `nodex_login_browser_start` | Starts browser device login; returns `verification_uri`, `device_code` (secret), `user_code`. Open the URL in a browser signed into Nodex, confirm, then poll. |
| `nodex_login_browser_poll` | `device_code` → `{ status: pending \| authorized \| expired \| invalid }`; on `authorized`, tokens are stored like `nodex_login`. |
| `nodex_logout` | Clears cloud session memory, notes catalog cache, and the persisted auth file when session mode is enabled. |
| `nodex_auth_status` | Safe diagnostics: `mode`, `authenticated`, `sync_base_host`, `persist_file_present`, JWT `unverified_sub` / `access_expires_at_ms` — **never** returns raw tokens. |

### Tool overlap (convenience vs lower-level)

**Decision:** keep the full WPN tool surface. Pairs below are **intentional convenience**; agents can use the lower-level tool instead when they already have ids.

| If you use… | Same effect as… |
|-------------|-------------------|
| `nodex_execute_note` | `nodex_find_notes` → then `nodex_get_note` when `status` is `unique` (one fewer round-trip when executing task notes). |
| `nodex_write_back_child` | `nodex_get_note`(`taskNoteId`) for `project_id` → `nodex_write_note` with `mode: "create_child"` and that `projectId` / `anchorId`. |
| `nodex_create_child_note` | Same POST child as `nodex_write_note` / `nodex_write_back_child`, but resolves the parent by nested title path or `parentWpnPath` when you do not have `parentNoteId`. |
| `nodex_resolve_note` | Not a duplicate of `nodex_find_notes`: triple match on **workspace + project + note title** vs free **title or UUID** + optional scope filters. |

`nodex_find_projects` and `nodex_list_wpn` are not redundant with the note catalog: different endpoints and shapes (project discovery vs flat `notes-with-context` vs per-project tree).

### Catalog request coalescing

`nodex_find_notes`, `nodex_resolve_note`, and `nodex_execute_note` all read `GET /wpn/notes-with-context`. The HTTP client keeps a **short in-memory TTL** (default 2.5s) for that response and **drops the cache after** `PATCH` / `POST` notes so writes are not hidden for long. Tight loops in one agent turn still hit the network at most once per TTL window for reads. For tests or special cases, construct `WpnHttpClient` with a `McpTokenHolder` and `{ notesWithContextTtlMs: 0 }` to disable caching.

**Binary / cloud assets:** sync-api `/me/assets` may return 501 until implemented; embed text in markdown or use URLs the host can fetch. Local assets stay on disk under the project folder (Electron).

## Environment

### Cloud (Cursor / Claude Desktop / Windsurf / CI)

- `NODEX_SYNC_API_BASE` — must include `/api/v1` (e.g. `http://127.0.0.1:4010/api/v1` or `https://your-host/api/v1`).
- `NODEX_ACCESS_TOKEN` **or** `NODEX_JWT` — raw JWT string (no `Bearer ` prefix). Required unless session mode is on.

### Cloud session + browser login (optional)

Set **`NODEX_MCP_CLOUD_SESSION=1`** to allow starting MCP **without** `NODEX_ACCESS_TOKEN`. Then:

1. Call **`nodex_login_browser_start`** (or **`nodex_login`** with email/password).
2. For browser flow: open the **full** **`verification_uri`** from the tool response (it includes `?user_code=…` — opening **`/mcp-auth` alone is not enough**). Sign in, click **Authorize** on `/mcp-auth`, then **`nodex_login_browser_poll`** with `device_code` until `status` is `authorized`.
3. Tokens are saved under **`$XDG_CONFIG_HOME/nodex/mcp-cloud-auth.json`** or **`~/.config/nodex/mcp-cloud-auth.json`** with mode **0600** (override with **`NODEX_MCP_AUTH_FILE`**). Optional **`NODEX_MCP_TOKEN_ENCRYPTION_KEY`** wraps the file (see `.env.example`).

**Threat model:** anyone with read access to your home directory can use the persisted JWT until expiry. Do not use session persistence on shared machines; prefer env-injected CI tokens. The persist file is **only** removed by **`nodex_logout`**; losing the in-memory session (e.g. process exit) does **not** delete it—tokens are reloaded on next MCP start.

**Server JWT TTL (sync-api):** Standard web/app: **`NODEX_JWT_ACCESS_EXPIRES`** (default `15m`) and **`NODEX_JWT_REFRESH_EXPIRES`** (default `30d`). **MCP** sessions (browser device flow + `nodex_login`): access **`NODEX_JWT_MCP_ACCESS_EXPIRES`** and refresh **`NODEX_JWT_MCP_REFRESH_EXPIRES`** (each default **`7d`**). Refresh rotation keeps MCP TTLs via an `mcp` claim on the refresh JWT. Longer values increase impact of token leakage. Concurrent device sessions are capped with **`NODEX_MAX_REFRESH_SESSIONS`** (default **20**, max **100**).

**Option B (full-stack Next, colocated `/api/v1`):** The same Next deployment that serves [`app/api/v1/[[...path]]`](../../apps/nodex-web/app/api/v1/[[...path]]/route.ts) must expose **`POST /auth/mcp/device/start`**. Set **`NODEX_MCP_WEB_VERIFY_BASE`** on the **Next server** env (Vercel project) to the public site origin (no trailing slash) so `verification_uri` is `https://your-host/mcp-auth?user_code=…`. After deploy, check from your machine: `npm run verify:mcp-device-start` at repo root (or `bash scripts/verify-mcp-device-start.sh https://your-host/api/v1`) — expect HTTP **200** and a printed `verification_uri`.

**Sync-api / Next:** The authorize API requires an **already signed-in** web Bearer token (anti-hijack); per-user **5** concurrent awaiting-MCP device sessions are enforced server-side.

**Cursor chat:** Ask the agent to run **`nodex_login_browser_start`** and paste the full **`verification_uri`** string from the tool JSON. If the tool returns **Not Found**, fix deployment until `device/start` returns 200 (see above).

When session mode is on but there is no token yet, WPN tools return JSON with **`error: "unauthenticated"`** and **`suggested_tools`** so agents call login tools first (see server `instructions`).

### Local (Electron file vault + MCP)

1. Start Electron with a folder vault open.
2. Set in the **main** process env: `NODEX_WPN_LOCAL_HTTP=1` (see [`.env.example`](../../.env.example)). Optional: `NODEX_WPN_LOCAL_HTTP_PORT`, `NODEX_LOCAL_WPN_TOKEN`.
3. Read `baseUrl` and `token` from Electron userData file `nodex-local-wpn-mcp.json` (written when the bridge starts), **or** set the same token in both Electron and MCP.
4. MCP env:

- `NODEX_LOCAL_WPN_URL` — e.g. `http://127.0.0.1:41234` (no `/api/v1` suffix for the bridge).
- `NODEX_LOCAL_WPN_TOKEN` — Bearer secret matching the bridge.

**Security:** Any local process can reach `127.0.0.1`; the bearer token is the gate. Disable the bridge when not needed (`NODEX_WPN_LOCAL_HTTP` unset).

## Run

```bash
# from repo root (after npm install)
npm run build -w @nodex-studio/mcp
node packages/nodex-mcp/dist/cli.js
# or
npm run dev -w @nodex-studio/mcp
```

## Examples: Cursor MCP (`mcp.json`)

Use an absolute path to `dist/cli.js` (or your global `nodex-mcp` binary). Replace host and secrets with your values.

### Cloud — fixed JWT (CI / stable token)

No interactive login. MCP exits at startup if the token is missing.

> **Token staleness warning:** Standard web access JWTs expire after `NODEX_JWT_ACCESS_EXPIRES` (default **15 minutes**). A fixed `NODEX_ACCESS_TOKEN` in `mcp.json` will go stale quickly — all WPN tools will return 401 until you replace it. For interactive use in Cursor/Claude Desktop, prefer **session mode** (`NODEX_MCP_CLOUD_SESSION=1`) which auto-refreshes. Use fixed tokens only for CI/CD with short-lived service-account JWTs or long-lived tokens issued by a custom `NODEX_JWT_ACCESS_EXPIRES` setting.
>
> **Optional refresh in cloud_env mode:** Set `NODEX_REFRESH_TOKEN` alongside `NODEX_ACCESS_TOKEN` to enable automatic token refresh when the access token expires. **Caution:** refresh tokens in shell env and CI logs are sensitive — prefer session mode (`NODEX_MCP_CLOUD_SESSION=1`) for interactive use, and ensure CI secrets are properly scoped and rotated.

```json
{
  "mcpServers": {
    "nodex": {
      "command": "node",
      "args": ["/absolute/path/to/nodex/packages/nodex-mcp/dist/cli.js"],
      "env": {
        "NODEX_SYNC_API_BASE": "http://127.0.0.1:4010/api/v1",
        "NODEX_ACCESS_TOKEN": "<jwt-from-web-login-or-service-account>"
      }
    }
  }
}
```

### Cloud — session mode (browser or `nodex_login`)

Omits `NODEX_ACCESS_TOKEN` at startup. Use tools `nodex_login_browser_start` → open the **full** `verification_uri` (includes `user_code`) → authorize in the browser → `nodex_login_browser_poll`, or `nodex_login` with email/password. Tokens persist under `~/.config/nodex/mcp-cloud-auth.json` (unless overridden).

On the **sync-api / Next** deployment, set server env **`NODEX_MCP_WEB_VERIFY_BASE`** to the public site origin (e.g. `https://your-app.vercel.app`) so `verification_uri` is `https://your-app.vercel.app/mcp-auth?user_code=…`. Verify deploy: `npm run verify:mcp-device-start` from repo root (see [`docs/deploy-nodex-sync.md`](../../docs/deploy-nodex-sync.md)).

```json
{
  "mcpServers": {
    "nodex-session": {
      "command": "node",
      "args": ["/absolute/path/to/nodex/packages/nodex-mcp/dist/cli.js"],
      "env": {
        "NODEX_SYNC_API_BASE": "https://your-app.vercel.app/api/v1",
        "NODEX_MCP_CLOUD_SESSION": "1"
      }
    }
  }
}
```

You can add to the same `env` object: **`NODEX_MCP_AUTH_FILE`** (custom persist path), **`NODEX_MCP_TOKEN_ENCRYPTION_KEY`** (encrypt the persist file; see repo [`.env.example`](../../.env.example)), or **`NODEX_ACCESS_TOKEN`** to seed a token while still allowing refresh + persist.

### Local — Electron loopback WPN

After Electron wrote `nodex-local-wpn-mcp.json` (or you set a fixed token in both places):

```json
{
  "mcpServers": {
    "nodex-local": {
      "command": "node",
      "args": ["/absolute/path/to/nodex/packages/nodex-mcp/dist/cli.js"],
      "env": {
        "NODEX_LOCAL_WPN_URL": "http://127.0.0.1:41234",
        "NODEX_LOCAL_WPN_TOKEN": "<same-as-electron-bridge>"
      }
    }
  }
}
```

## CI

Use a machine-safe JWT (service account or long-lived test user) with `NODEX_SYNC_API_BASE` + `NODEX_ACCESS_TOKEN`. Leave **`NODEX_MCP_CLOUD_SESSION` unset** in pipelines so startup fails fast if the token is missing. Do not commit secrets; inject via CI secrets.

## Tests

```bash
npm test -w @nodex-studio/mcp
# from repo root:
npm run test:mcp
```
