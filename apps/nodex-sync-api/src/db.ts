import {
  MongoClient,
  type Collection,
  type Db,
  type MongoClientOptions,
  type ObjectId,
} from "mongodb";

export type SyncNoteDoc = {
  id: string;
  userId: string;
  updatedAt: number;
  deleted: boolean;
  version: number;
  title: string;
  content: string;
  type: "markdown" | "text" | "code";
};

/** WPN workspace row (Mongo); aligns with {@link WpnWorkspaceRow} in repo `wpn-v2-types`. */
export type WpnWorkspaceDoc = {
  id: string;
  userId: string;
  name: string;
  sort_index: number;
  color_token: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  /** Arbitrary UI/settings blob (GET/PATCH `/wpn/workspaces/:id/settings`). */
  settings?: Record<string, unknown> | null;
};

export type WpnProjectDoc = {
  id: string;
  userId: string;
  workspace_id: string;
  name: string;
  sort_index: number;
  color_token: string | null;
  created_at_ms: number;
  updated_at_ms: number;
  settings?: Record<string, unknown> | null;
};

export type WpnNoteDoc = {
  id: string;
  userId: string;
  project_id: string;
  parent_id: string | null;
  type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  sibling_index: number;
  created_at_ms: number;
  updated_at_ms: number;
  /** Soft-delete for future sync; reads ignore when true. */
  deleted?: boolean;
};

export type WpnExplorerStateDoc = {
  userId: string;
  project_id: string;
  expanded_ids: string[];
};

/** Per-user UI chrome persisted from web (shell layout, etc.). */
export type UserPrefsDoc = {
  userId: string;
  shellLayout: unknown | null;
  updatedAtMs: number;
};

/** MCP browser device login (OAuth-style); TTL via `expiresAt`. */
export type McpDeviceSessionDoc = {
  _id?: ObjectId;
  userCode: string;
  deviceCodeHash: string;
  status: "awaiting_user" | "awaiting_mcp" | "consumed";
  clientIp: string;
  createdAt: Date;
  expiresAt: Date;
  boundUserId?: string;
  issuedAccessToken?: string | null;
  issuedRefreshToken?: string | null;
};

let client: MongoClient | null = null;
let db: Db | null = null;
let connectInFlight: Promise<Db> | null = null;

function mongoClientOptions(): MongoClientOptions {
  const serverless =
    process.env.VERCEL === "1" || process.env.NODEX_SYNC_API_SERVERLESS === "1";
  return {
    maxPoolSize: serverless ? 10 : 100,
    minPoolSize: serverless ? 0 : undefined,
    serverSelectionTimeoutMS: 10_000,
  };
}

export async function connectMongo(uri: string, dbName: string): Promise<Db> {
  if (db) {
    return db;
  }
  connectInFlight ??= (async () => {
    const c = new MongoClient(uri, mongoClientOptions());
    await c.connect();
    client = c;
    const database = c.db(dbName);
    await ensureIndexes(database);
    db = database;
    return database;
  })();
  try {
    return await connectInFlight;
  } finally {
    connectInFlight = null;
  }
}

/**
 * Idempotent Mongo connect using `MONGODB_URI` / `MONGODB_DB` (or dev defaults).
 * Safe for serverless: concurrent invocations share one in-flight connect.
 */
export async function ensureMongoConnected(): Promise<Db> {
  const uri =
    typeof process.env.MONGODB_URI === "string" && process.env.MONGODB_URI.trim()
      ? process.env.MONGODB_URI.trim()
      : "mongodb://127.0.0.1:27017";
  const dbName =
    typeof process.env.MONGODB_DB === "string" && process.env.MONGODB_DB.trim()
      ? process.env.MONGODB_DB.trim()
      : "nodex_sync";
  return connectMongo(uri, dbName);
}

async function ensureIndexes(database: Db): Promise<void> {
  await database.collection("users").createIndex({ email: 1 }, { unique: true });
  const notes = database.collection<SyncNoteDoc>("notes");
  await notes.createIndex({ id: 1, userId: 1 }, { unique: true });
  await notes.createIndex({ userId: 1, updatedAt: 1 });

  const wpnWs = database.collection<WpnWorkspaceDoc>("wpn_workspaces");
  await wpnWs.createIndex({ id: 1, userId: 1 }, { unique: true });
  await wpnWs.createIndex({ userId: 1, sort_index: 1 });

  const wpnProj = database.collection<WpnProjectDoc>("wpn_projects");
  await wpnProj.createIndex({ id: 1, userId: 1 }, { unique: true });
  await wpnProj.createIndex({ userId: 1, workspace_id: 1, sort_index: 1 });

  const wpnNotes = database.collection<WpnNoteDoc>("wpn_notes");
  await wpnNotes.createIndex({ id: 1, userId: 1 }, { unique: true });
  await wpnNotes.createIndex({ userId: 1, project_id: 1, parent_id: 1, sibling_index: 1 });

  const wpnEx = database.collection<WpnExplorerStateDoc>("wpn_explorer_state");
  await wpnEx.createIndex({ userId: 1, project_id: 1 }, { unique: true });

  const prefs = database.collection<UserPrefsDoc>("user_prefs");
  await prefs.createIndex({ userId: 1 }, { unique: true });

  const mcpDev = database.collection<McpDeviceSessionDoc>("mcp_device_sessions");
  await mcpDev.createIndex({ userCode: 1 }, { unique: true });
  await mcpDev.createIndex({ deviceCodeHash: 1 }, { unique: true });
  await mcpDev.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await mcpDev.createIndex({ boundUserId: 1, status: 1, expiresAt: 1 });
}

export function getNotesCollection(): Collection<SyncNoteDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<SyncNoteDoc>("notes");
}

export type UserDoc = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  /** Refresh token jti; new login/register overwrites → other clients cannot refresh. */
  activeRefreshJti?: string | null;
};

export function getUsersCollection(): Collection {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection("users");
}

export function getWpnWorkspacesCollection(): Collection<WpnWorkspaceDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<WpnWorkspaceDoc>("wpn_workspaces");
}

export function getWpnProjectsCollection(): Collection<WpnProjectDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<WpnProjectDoc>("wpn_projects");
}

export function getWpnNotesCollection(): Collection<WpnNoteDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<WpnNoteDoc>("wpn_notes");
}

export function getWpnExplorerStateCollection(): Collection<WpnExplorerStateDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<WpnExplorerStateDoc>("wpn_explorer_state");
}

export function getUserPrefsCollection(): Collection<UserPrefsDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<UserPrefsDoc>("user_prefs");
}

export function getMcpDeviceSessionsCollection(): Collection<McpDeviceSessionDoc> {
  if (!db) {
    throw new Error("MongoDB not connected");
  }
  return db.collection<McpDeviceSessionDoc>("mcp_device_sessions");
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
