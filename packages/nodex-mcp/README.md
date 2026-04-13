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
| `nodex_write_note` | Discriminated `mode`: `patch_existing`, `create_root`, `create_child`, `create_sibling` (maps to `PATCH` / `POST` WPN routes). |
| `nodex_write_back_child` | After work scoped to a task note: `taskNoteId` + `title` + `content` → new **direct child** of that note (loads `projectId` via `GET /wpn/notes/:id`, then `POST` child). |

**Binary / cloud assets:** sync-api `/me/assets` may return 501 until implemented; embed text in markdown or use URLs the host can fetch. Local assets stay on disk under the project folder (Electron).

## Environment

### Cloud (Cursor / Claude Desktop / Windsurf / CI)

- `NODEX_SYNC_API_BASE` — must include `/api/v1` (e.g. `http://127.0.0.1:4010/api/v1` or `https://your-host/api/v1`).
- `NODEX_ACCESS_TOKEN` **or** `NODEX_JWT` — raw JWT string (no `Bearer ` prefix).

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

## Example: Cursor MCP (`mcp.json`)

Cloud:

```json
{
  "mcpServers": {
    "nodex": {
      "command": "node",
      "args": ["/absolute/path/to/nodex/packages/nodex-mcp/dist/cli.js"],
      "env": {
        "NODEX_SYNC_API_BASE": "http://127.0.0.1:4010/api/v1",
        "NODEX_ACCESS_TOKEN": "<jwt-from-login>"
      }
    }
  }
}
```

Local (after Electron wrote `nodex-local-wpn-mcp.json` or you set a fixed token):

```json
{
  "mcpServers": {
    "nodex-local": {
      "command": "node",
      "args": ["/absolute/path/to/nodex/packages/nodex-mcp/dist/cli.js"],
      "env": {
        "NODEX_LOCAL_WPN_URL": "http://127.0.0.1:41234",
        "NODEX_LOCAL_WPN_TOKEN": "<same-as-electron>"
      }
    }
  }
}
```

## CI

Use a machine-safe JWT (service account or long-lived test user) with `NODEX_SYNC_API_BASE` + `NODEX_ACCESS_TOKEN`. Do not commit secrets; inject via CI secrets.

## Tests

```bash
npm test -w @nodex-studio/mcp
# from repo root:
npm run test:mcp
```
