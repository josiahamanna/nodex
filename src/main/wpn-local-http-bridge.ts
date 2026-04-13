import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";
import { app } from "electron";
import { registry } from "../core/registry";
import { getNotesDatabase } from "../core/workspace-store";
import { getWpnOwnerId } from "../core/wpn/wpn-owner";
import { wpnJsonListProjects, wpnJsonListWorkspaces } from "../core/wpn/wpn-json-service";
import {
  WpnJsonDuplicateTitleError,
  WPN_LOCAL_DUPLICATE_NOTE_TITLE_MESSAGE,
  wpnJsonCreateNote,
  wpnJsonGetNoteById,
  wpnJsonListAllNotesWithContext,
  wpnJsonListNotesFlat,
  wpnJsonUpdateNote,
} from "../core/wpn/wpn-json-notes";
import { wpnJsonApplyVfsRewritesAfterTitleChange } from "../core/wpn/wpn-rename-vfs-rewrite";
import { isValidNoteId, isValidNoteType } from "../shared/validators";
import { ctx } from "./main-context";

const MCP_STATE_FILE = "nodex-local-wpn-mcp.json";

let bridgeServer: http.Server | null = null;
let bridgeToken: string | null = null;

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as unknown);
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function bearerFromRequest(req: http.IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (typeof h !== "string" || !h.startsWith("Bearer ")) {
    return null;
  }
  return h.slice("Bearer ".length).trim() || null;
}

function resolveBridgeToken(userDataPath: string): string {
  const fromEnv = process.env.NODEX_LOCAL_WPN_TOKEN?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const statePath = path.join(userDataPath, MCP_STATE_FILE);
  try {
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as { token?: string };
      if (typeof raw.token === "string" && raw.token.length > 0) {
        return raw.token;
      }
    }
  } catch {
    /* fall through */
  }
  const token = crypto.randomBytes(24).toString("hex");
  try {
    fs.writeFileSync(
      statePath,
      JSON.stringify({ token, baseUrl: null, updatedAtMs: Date.now() }, null, 2),
      "utf8",
    );
  } catch (e) {
    console.warn("[WPN local HTTP] Could not persist MCP token file:", e);
  }
  return token;
}

function persistBridgeMeta(userDataPath: string, baseUrl: string, token: string): void {
  const statePath = path.join(userDataPath, MCP_STATE_FILE);
  try {
    fs.writeFileSync(
      statePath,
      JSON.stringify(
        {
          token,
          baseUrl,
          updatedAtMs: Date.now(),
          hint: "Use baseUrl + Bearer token in NODEX_LOCAL_WPN_URL / NODEX_LOCAL_WPN_TOKEN for @nodex-studio/mcp.",
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch (e) {
    console.warn("[WPN local HTTP] Could not write MCP meta file:", e);
  }
}

function stopBridge(): void {
  if (bridgeServer) {
    try {
      bridgeServer.close();
    } catch {
      /* ignore */
    }
    bridgeServer = null;
  }
  bridgeToken = null;
}

function requireStore() {
  const store = getNotesDatabase();
  if (!store) {
    throw new Error("Workspace store is not open");
  }
  return store;
}

function handleWpnRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  token: string,
): void {
  void (async () => {
    try {
      const auth = bearerFromRequest(req);
      if (!auth || auth !== token) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }

      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const pathname = url.pathname.replace(/\/+$/, "") || "/";
      const method = (req.method ?? "GET").toUpperCase();
      const ownerId = getWpnOwnerId();

      if (method === "GET" && pathname === "/wpn/workspaces") {
        const store = requireStore();
        const workspaces = wpnJsonListWorkspaces(store, ownerId);
        sendJson(res, 200, { workspaces });
        return;
      }

      const wsProjectsMatch = /^\/wpn\/workspaces\/([^/]+)\/projects$/.exec(pathname);
      if (method === "GET" && wsProjectsMatch) {
        const workspaceId = decodeURIComponent(wsProjectsMatch[1]!);
        const store = requireStore();
        try {
          const projects = wpnJsonListProjects(store, ownerId, workspaceId);
          sendJson(res, 200, { projects });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "Workspace not found") {
            sendJson(res, 404, { error: msg });
            return;
          }
          sendJson(res, 400, { error: msg });
        }
        return;
      }

      const projNotesMatch = /^\/wpn\/projects\/([^/]+)\/notes$/.exec(pathname);
      if (method === "GET" && projNotesMatch) {
        const projectId = decodeURIComponent(projNotesMatch[1]!);
        const store = requireStore();
        try {
          const notes = wpnJsonListNotesFlat(store, ownerId, projectId);
          sendJson(res, 200, { notes });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "Project not found") {
            sendJson(res, 404, { error: msg });
            return;
          }
          sendJson(res, 400, { error: msg });
        }
        return;
      }

      if (method === "GET" && pathname === "/wpn/notes-with-context") {
        const store = requireStore();
        const notes = wpnJsonListAllNotesWithContext(store, ownerId);
        sendJson(res, 200, { notes });
        return;
      }

      const notePathMatch = /^\/wpn\/notes\/([^/]+)$/.exec(pathname);
      if (method === "GET" && notePathMatch) {
        const id = decodeURIComponent(notePathMatch[1]!);
        const store = requireStore();
        const n = wpnJsonGetNoteById(store, ownerId, id);
        if (!n) {
          sendJson(res, 404, { error: "Note not found" });
          return;
        }
        sendJson(res, 200, { note: n });
        return;
      }

      if (method === "PATCH" && notePathMatch) {
        const id = decodeURIComponent(notePathMatch[1]!);
        if (!isValidNoteId(id)) {
          sendJson(res, 400, { error: "Invalid note id" });
          return;
        }
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        const patch: {
          title?: string;
          content?: string;
          type?: string;
          metadata?: Record<string, unknown> | null;
        } = {};
        if (typeof body.title === "string") {
          patch.title = body.title;
        }
        if (typeof body.content === "string") {
          patch.content = body.content;
        }
        if (typeof body.type === "string") {
          patch.type = body.type;
        }
        if (body.metadata === null || (body.metadata && typeof body.metadata === "object")) {
          patch.metadata = body.metadata as Record<string, unknown> | null;
        }
        const store = requireStore();
        const before =
          patch.title !== undefined ? wpnJsonGetNoteById(store, ownerId, id) : null;
        let note;
        try {
          note = wpnJsonUpdateNote(store, ownerId, id, patch);
        } catch (e) {
          if (e instanceof WpnJsonDuplicateTitleError) {
            sendJson(res, 409, { error: WPN_LOCAL_DUPLICATE_NOTE_TITLE_MESSAGE });
            return;
          }
          throw e;
        }
        if (!note) {
          sendJson(res, 404, { error: "Note not found" });
          return;
        }
        if (
          before &&
          patch.title !== undefined &&
          (patch.title.trim() || before.title) !== before.title
        ) {
          wpnJsonApplyVfsRewritesAfterTitleChange(store, ownerId, id, before.title, note.title);
        }
        sendJson(res, 200, { note });
        return;
      }

      const postNoteMatch = /^\/wpn\/projects\/([^/]+)\/notes$/.exec(pathname);
      if (method === "POST" && postNoteMatch) {
        const projectId = decodeURIComponent(postNoteMatch[1]!);
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        const type = typeof body.type === "string" ? body.type.trim() : "";
        const rel = body.relation;
        if (!type) {
          sendJson(res, 400, { error: "Invalid note type" });
          return;
        }
        const selectable = registry.getSelectableNoteTypes();
        if (!isValidNoteType(type) || !selectable.includes(type)) {
          sendJson(res, 400, { error: "Invalid note type" });
          return;
        }
        if (rel !== "child" && rel !== "sibling" && rel !== "root") {
          sendJson(res, 400, { error: "Invalid relation" });
          return;
        }
        const anchorId = typeof body.anchorId === "string" ? body.anchorId : undefined;
        const store = requireStore();
        try {
          const created = wpnJsonCreateNote(store, ownerId, projectId, {
            anchorId: rel === "root" ? undefined : anchorId,
            relation: rel,
            type,
            content: typeof body.content === "string" ? body.content : undefined,
            title: typeof body.title === "string" ? body.title : undefined,
            metadata:
              body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
                ? (body.metadata as Record<string, unknown>)
                : undefined,
          });
          sendJson(res, 201, created);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "Project not found") {
            sendJson(res, 404, { error: msg });
            return;
          }
          sendJson(res, 400, { error: msg });
        }
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { error: msg });
    }
  })();
}

/**
 * Start or stop the loopback WPN HTTP bridge for MCP (`@nodex-studio/mcp` local mode).
 * Enable with `NODEX_WPN_LOCAL_HTTP=1`. Token: `NODEX_LOCAL_WPN_TOKEN` or persisted under userData.
 */
export function syncWpnLocalHttpBridgeState(): void {
  if (!app.isReady()) {
    return;
  }
  const userDataPath = app.getPath("userData");
  const enabled = envFlag("NODEX_WPN_LOCAL_HTTP");
  const store = getNotesDatabase();
  const vaultOpen = ctx.workspaceRoots.length > 0 && store !== null;

  if (!enabled || !vaultOpen) {
    stopBridge();
    return;
  }

  const token = resolveBridgeToken(userDataPath);
  if (bridgeServer && bridgeToken === token) {
    return;
  }

  stopBridge();
  bridgeToken = token;

  const server = http.createServer((req, res) => {
    handleWpnRequest(req, res, token);
  });

  const portRaw = process.env.NODEX_WPN_LOCAL_HTTP_PORT?.trim();
  const port = portRaw ? parseInt(portRaw, 10) : 0;
  const listenPort = Number.isFinite(port) && port >= 0 ? port : 0;

  server.listen(listenPort, "127.0.0.1", () => {
    const addr = server.address();
    const p = typeof addr === "object" && addr ? addr.port : listenPort;
    const baseUrl = `http://127.0.0.1:${p}`;
    bridgeServer = server;
    console.log(`[WPN local HTTP] MCP bridge listening ${baseUrl} (Bearer token in userData ${MCP_STATE_FILE} or NODEX_LOCAL_WPN_TOKEN)`);
    persistBridgeMeta(userDataPath, baseUrl, token);
  });

  server.on("error", (err) => {
    console.error("[WPN local HTTP] server error:", err);
    stopBridge();
  });
}
