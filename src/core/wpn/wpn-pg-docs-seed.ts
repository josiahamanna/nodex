import * as fs from "fs";
import * as path from "path";
import type { Pool } from "pg";
import * as crypto from "crypto";

type Manifest = {
  version: number;
  folder: { id: string; title: string };
  hubPlaceholder?: { id: string; file: string; title: string };
  companionPanels?: Array<{ id: string; file: string; title: string; slot: string }>;
  pages: Array<{ id: string; file: string; title: string; section?: string }>;
};

function isHub(h: unknown): h is NonNullable<Manifest["hubPlaceholder"]> {
  return (
    !!h &&
    typeof h === "object" &&
    typeof (h as { id?: unknown }).id === "string" &&
    typeof (h as { file?: unknown }).file === "string" &&
    typeof (h as { title?: unknown }).title === "string"
  );
}

function isCompanionPanels(a: unknown): a is NonNullable<Manifest["companionPanels"]> {
  if (!Array.isArray(a)) return false;
  return a.every(
    (p) =>
      p &&
      typeof p === "object" &&
      typeof (p as { id?: unknown }).id === "string" &&
      typeof (p as { file?: unknown }).file === "string" &&
      typeof (p as { title?: unknown }).title === "string" &&
      typeof (p as { slot?: unknown }).slot === "string",
  );
}

const DEFAULT_RELATIVE_DIR = path.join("docs", "bundled-plugin-authoring");

function resolveDocsDir(): string {
  const env = process.env.NODEX_BUNDLED_DOCS_DIR?.trim();
  if (env) return path.resolve(env);
  return path.resolve(process.cwd(), DEFAULT_RELATIVE_DIR);
}

function readManifest(dir: string): Manifest | null {
  const p = path.join(dir, "manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw) as Manifest;
    if (
      j &&
      typeof j.version === "number" &&
      j.folder &&
      typeof j.folder.id === "string" &&
      typeof j.folder.title === "string" &&
      (j.hubPlaceholder === undefined || isHub(j.hubPlaceholder)) &&
      (j.companionPanels === undefined || isCompanionPanels(j.companionPanels)) &&
      Array.isArray(j.pages) &&
      j.pages.every(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.file === "string" &&
          typeof p.title === "string" &&
          (p.section === undefined || typeof p.section === "string"),
      )
    ) {
      return j;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function nowMs(): number {
  return Date.now();
}

function docsNoteId(workspaceId: string, logicalId: string): string {
  return `wpn-docs:${workspaceId}:${logicalId}`;
}

async function findDocsProjectId(
  pool: Pool,
  ownerId: string,
  workspaceId: string,
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT p.id
     FROM wpn_project p
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE p.workspace_id = $1 AND w.owner_id = $2 AND p.name = $3
     ORDER BY p.sort_index ASC, p.created_at_ms ASC
     LIMIT 1`,
    [workspaceId, ownerId, "Documentation"],
  );
  const id = (rows[0] as { id?: string } | undefined)?.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function createDocsProject(
  pool: Pool,
  ownerId: string,
  workspaceId: string,
): Promise<string> {
  const { rows } = await pool.query(
    "SELECT id FROM wpn_workspace WHERE id = $1 AND owner_id = $2",
    [workspaceId, ownerId],
  );
  if (rows.length === 0) {
    throw new Error("Workspace not found");
  }
  const t = nowMs();
  const pid = crypto.randomUUID();
  const { rows: maxRows } = await pool.query<{ m: string }>(
    "SELECT COALESCE(MAX(sort_index), -1)::text AS m FROM wpn_project WHERE workspace_id = $1",
    [workspaceId],
  );
  const sort_index = Number(maxRows[0]?.m ?? -1) + 1;
  await pool.query(
    `INSERT INTO wpn_project (id, workspace_id, name, sort_index, color_token, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, $4, NULL, $5, $6)`,
    [pid, workspaceId, "Documentation", sort_index, t, t],
  );
  return pid;
}

async function upsertDocNote(
  pool: Pool,
  projectId: string,
  id: string,
  parentId: string | null,
  siblingIndex: number,
  title: string,
  content: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const t = nowMs();
  await pool.query(
    `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, 'markdown', $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       parent_id = EXCLUDED.parent_id,
       type = EXCLUDED.type,
       title = EXCLUDED.title,
       content = EXCLUDED.content,
       metadata_json = EXCLUDED.metadata_json,
       sibling_index = EXCLUDED.sibling_index,
       updated_at_ms = EXCLUDED.updated_at_ms`,
    [
      id,
      projectId,
      parentId,
      title,
      content,
      JSON.stringify(metadata),
      siblingIndex,
      t,
      t,
    ],
  );
}

/**
 * Seed bundled docs into Postgres as WPN notes under a dedicated "Documentation" project.
 * Safe to call multiple times; overwrites doc note bodies from disk.
 */
export async function wpnPgEnsureBundledDocsSeeded(
  pool: Pool,
  ownerId: string,
  workspaceId: string,
): Promise<{ projectId: string | null; seeded: boolean }> {
  const dir = resolveDocsDir();
  const manifest = fs.existsSync(dir) ? readManifest(dir) : null;
  if (!manifest || manifest.pages.length === 0) {
    return { projectId: null, seeded: false };
  }

  const projectId =
    (await findDocsProjectId(pool, ownerId, workspaceId)) ??
    (await createDocsProject(pool, ownerId, workspaceId));

  const metaBase = { bundledDoc: true, manifestVersion: manifest.version };

  const folderId = docsNoteId(workspaceId, manifest.folder.id);
  await upsertDocNote(
    pool,
    projectId,
    folderId,
    null,
    0,
    manifest.folder.title,
    "# Documentation\n\nBundled read-only guides: **User guide** and **Plugin authoring**. Open a child page or use Documentation → Guides in the app.",
    { ...metaBase, bundledDocRole: "folder" },
  );

  for (let i = 0; i < manifest.pages.length; i++) {
    const page = manifest.pages[i]!;
    const fp = path.join(dir, page.file);
    if (!fs.existsSync(fp)) continue;
    let content = "";
    try {
      content = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    const id = docsNoteId(workspaceId, page.id);
    await upsertDocNote(pool, projectId, id, folderId, i, page.title, content, {
      ...metaBase,
      bundledDocRole: "page",
      bundledDocOrder: i,
      bundledDocSection: page.section ?? "Plugin authoring",
      sourceFile: page.file,
    });
  }

  const hub = manifest.hubPlaceholder;
  if (hub) {
    const fp = path.join(dir, hub.file);
    if (fs.existsSync(fp)) {
      try {
        const content = fs.readFileSync(fp, "utf8");
        const id = docsNoteId(workspaceId, hub.id);
        await upsertDocNote(pool, projectId, id, folderId, 1000, hub.title, content, {
          ...metaBase,
          bundledDocRole: "hub",
          bundledDocOrder: -5,
          sourceFile: hub.file,
        });
      } catch {
        /* ignore */
      }
    }
  }

  const companions = manifest.companionPanels ?? [];
  for (let i = 0; i < companions.length; i++) {
    const cp = companions[i]!;
    const fp = path.join(dir, cp.file);
    if (!fs.existsSync(fp)) continue;
    let content = "";
    try {
      content = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    const id = docsNoteId(workspaceId, cp.id);
    await upsertDocNote(pool, projectId, id, folderId, 1001 + i, cp.title, content, {
      ...metaBase,
      bundledDocRole: "companion",
      bundledDocCompanionSlot: cp.slot,
      bundledDocOrder: 5000 + i,
      sourceFile: cp.file,
    });
  }

  return { projectId, seeded: true };
}

