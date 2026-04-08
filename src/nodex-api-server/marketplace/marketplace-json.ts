import * as fs from "fs";
import * as path from "path";

export type MarketplaceUserRow = {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
};

export type MarketplacePluginRow = {
  id: number;
  name: string;
  owner_user_id: number;
  created_at: string;
};

export type MarketplaceReleaseRow = {
  id: number;
  plugin_id: number;
  version: string;
  object_key: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  status: string;
};

export type MarketplaceIntentRow = {
  id: number;
  user_id: number;
  plugin_name: string;
  version: string;
  object_key: string;
  sha256: string;
  content_type: string;
  size_bytes: number;
  finalize_token: string;
  created_at: string;
  expires_at: string;
};

export type MarketplaceState = {
  version: 1;
  nextId: number;
  users: MarketplaceUserRow[];
  plugins: MarketplacePluginRow[];
  releases: MarketplaceReleaseRow[];
  intents: MarketplaceIntentRow[];
};

function emptyState(): MarketplaceState {
  return {
    version: 1,
    nextId: 1,
    users: [],
    plugins: [],
    releases: [],
    intents: [],
  };
}

function normalizeState(raw: unknown): MarketplaceState {
  if (!raw || typeof raw !== "object") {
    return emptyState();
  }
  const o = raw as Record<string, unknown>;
  return {
    version: 1,
    nextId: typeof o.nextId === "number" && o.nextId > 0 ? o.nextId : 1,
    users: Array.isArray(o.users) ? (o.users as MarketplaceUserRow[]) : [],
    plugins: Array.isArray(o.plugins) ? (o.plugins as MarketplacePluginRow[]) : [],
    releases: Array.isArray(o.releases) ? (o.releases as MarketplaceReleaseRow[]) : [],
    intents: Array.isArray(o.intents) ? (o.intents as MarketplaceIntentRow[]) : [],
  };
}

export function loadMarketplaceState(dbPath: string): MarketplaceState {
  if (!fs.existsSync(dbPath)) {
    return emptyState();
  }
  try {
    return normalizeState(JSON.parse(fs.readFileSync(dbPath, "utf8")));
  } catch {
    return emptyState();
  }
}

export function saveMarketplaceState(dbPath: string, state: MarketplaceState): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const tmp = `${dbPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), "utf8");
  fs.renameSync(tmp, dbPath);
}

export function allocId(state: MarketplaceState): number {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

/** Published releases joined to plugin names, newest `created_at` first (S3 marketplace listing). */
export function listPublishedMarketplaceEntries(state: MarketplaceState): Array<{
  name: string;
  version: string;
  object_key: string;
  created_at: string;
}> {
  const byPluginId = new Map(state.plugins.map((p) => [p.id, p]));
  return state.releases
    .filter((r) => r.status === "published")
    .map((r) => {
      const p = byPluginId.get(r.plugin_id);
      if (!p) {
        return null;
      }
      return {
        name: p.name,
        version: r.version,
        object_key: r.object_key,
        created_at: r.created_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}
