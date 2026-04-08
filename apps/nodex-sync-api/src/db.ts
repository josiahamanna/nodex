import { MongoClient, type Collection, type Db, type ObjectId } from "mongodb";

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

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(uri: string, dbName: string): Promise<Db> {
  if (db) {
    return db;
  }
  const c = new MongoClient(uri);
  await c.connect();
  client = c;
  db = c.db(dbName);
  await ensureIndexes(db);
  return db;
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

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}
