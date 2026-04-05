import * as crypto from "crypto";
import type { Pool } from "pg";
import { normalizeLegacyNoteType } from "../../shared/note-type-legacy";
import type { NoteMovePlacement } from "../../shared/nodex-renderer-api";
import { collectReferencedNoteIdsFromMarkdown } from "../../shared/markdown-internal-note-href";
import { wpnComputeChildMapAfterMove } from "./wpn-note-move";
import type {
  WpnBacklinkSourceItem,
  WpnNoteDetail,
  WpnNoteListItem,
  WpnNoteWithContextListItem,
} from "../../shared/wpn-v2-types";
import { wpnPgProjectOwnedBy } from "./wpn-pg-service";
import type { WpnNoteRow } from "./wpn-types";

function nowMs(): number {
  return Date.now();
}

function newId(): string {
  return crypto.randomUUID();
}

function parseMetadata(json: string | null): Record<string, unknown> | undefined {
  if (json == null || json === "") return undefined;
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function rowToWpnNoteRow(r: Record<string, unknown>): WpnNoteRow {
  return {
    id: String(r.id),
    project_id: String(r.project_id),
    parent_id: r.parent_id == null ? null : String(r.parent_id),
    type: normalizeLegacyNoteType(String(r.type)),
    title: String(r.title),
    content: String(r.content ?? ""),
    metadata_json: r.metadata_json == null ? null : String(r.metadata_json),
    sibling_index: Number(r.sibling_index),
    created_at_ms: Number(r.created_at_ms),
    updated_at_ms: Number(r.updated_at_ms),
  };
}

async function loadRows(pool: Pool, projectId: string): Promise<WpnNoteRow[]> {
  const { rows } = await pool.query(
    `SELECT id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms
     FROM wpn_note WHERE project_id = $1`,
    [projectId],
  );
  return rows.map((x) => rowToWpnNoteRow(x as Record<string, unknown>));
}

function childrenMapFromRows(rows: WpnNoteRow[]): Map<string | null, WpnNoteRow[]> {
  const m = new Map<string | null, WpnNoteRow[]>();
  for (const r of rows) {
    const k = r.parent_id;
    const arr = m.get(k) ?? [];
    arr.push(r);
    m.set(k, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => a.sibling_index - b.sibling_index);
  }
  return m;
}

async function requireWpnPgProject(
  pool: Pool,
  ownerId: string,
  projectId: string,
): Promise<void> {
  if (!(await wpnPgProjectOwnedBy(pool, ownerId, projectId))) {
    throw new Error("Project not found");
  }
}

export async function wpnPgListNotesFlat(
  pool: Pool,
  ownerId: string,
  projectId: string,
): Promise<WpnNoteListItem[]> {
  await requireWpnPgProject(pool, ownerId, projectId);
  const rows = await loadRows(pool, projectId);
  const cm = childrenMapFromRows(rows);
  const out: WpnNoteListItem[] = [];
  const visit = (parentId: string | null, depth: number): void => {
    const kids = cm.get(parentId) ?? [];
    for (const r of kids) {
      out.push({
        id: r.id,
        project_id: r.project_id,
        parent_id: r.parent_id,
        type: r.type,
        title: r.title,
        depth,
        sibling_index: r.sibling_index,
      });
      visit(r.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

export async function wpnPgGetNoteById(
  pool: Pool,
  ownerId: string,
  noteId: string,
): Promise<WpnNoteDetail | null> {
  const { rows } = await pool.query(
    `SELECT n.id, n.project_id, n.parent_id, n.type, n.title, n.content, n.metadata_json, n.sibling_index, n.created_at_ms, n.updated_at_ms
     FROM wpn_note n
     INNER JOIN wpn_project p ON p.id = n.project_id
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE n.id = $1 AND w.owner_id = $2`,
    [noteId, ownerId],
  );
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  const wr = rowToWpnNoteRow(r);
  return {
    id: wr.id,
    project_id: wr.project_id,
    parent_id: wr.parent_id,
    type: wr.type,
    title: wr.title,
    content: wr.content,
    metadata: parseMetadata(wr.metadata_json),
    sibling_index: wr.sibling_index,
    created_at_ms: wr.created_at_ms,
    updated_at_ms: wr.updated_at_ms,
  };
}

async function applySiblingOrderPg(
  pool: Pool,
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  const t = nowMs();
  for (let i = 0; i < orderedIds.length; i++) {
    await pool.query(
      "UPDATE wpn_note SET sibling_index = $1, updated_at_ms = $2 WHERE id = $3 AND project_id = $4",
      [i, t, orderedIds[i], projectId],
    );
  }
}

export async function wpnPgCreateNote(
  pool: Pool,
  ownerId: string,
  projectId: string,
  payload: {
    anchorId?: string;
    relation: "child" | "sibling" | "root";
    type: string;
    content?: string;
    title?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<{ id: string }> {
  await requireWpnPgProject(pool, ownerId, projectId);

  const rows = await loadRows(pool, projectId);
  const cm = childrenMapFromRows(rows);
  const id = newId();
  const t = nowMs();
  const title = (payload.title ?? "").trim() || "Untitled";
  const content = payload.content ?? "";
  const metadata_json =
    payload.metadata && Object.keys(payload.metadata).length > 0
      ? JSON.stringify(payload.metadata)
      : null;
  const noteType = normalizeLegacyNoteType(payload.type);

  let parent_id: string | null = null;
  let sibling_index = 0;

  if (payload.relation === "root") {
    const roots = cm.get(null) ?? [];
    sibling_index = roots.length === 0 ? 0 : Math.max(...roots.map((r) => r.sibling_index)) + 1;
  } else if (!payload.anchorId) {
    throw new Error("anchorId required for child/sibling");
  } else {
    const anchor = rows.find((r) => r.id === payload.anchorId);
    if (!anchor) throw new Error("Anchor note not found");
    if (payload.relation === "child") {
      parent_id = anchor.id;
      const kids = cm.get(anchor.id) ?? [];
      sibling_index = kids.length === 0 ? 0 : Math.max(...kids.map((r) => r.sibling_index)) + 1;
    } else {
      parent_id = anchor.parent_id;
      const sibs = (cm.get(parent_id) ?? [])
        .slice()
        .sort((a, b) => a.sibling_index - b.sibling_index);
      const ai = sibs.findIndex((x) => x.id === anchor.id);
      if (ai < 0) throw new Error("Invalid anchor");
      const orderedIds = [
        ...sibs.slice(0, ai + 1).map((r) => r.id),
        id,
        ...sibs.slice(ai + 1).map((r) => r.id),
      ];
      await pool.query(
        `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)`,
        [id, projectId, parent_id, noteType, title, content, metadata_json, t, t],
      );
      await applySiblingOrderPg(pool, projectId, orderedIds);
      return { id };
    }
  }

  await pool.query(
    `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      projectId,
      parent_id,
      noteType,
      title,
      content,
      metadata_json,
      sibling_index,
      t,
      t,
    ],
  );
  return { id };
}

export async function wpnPgUpdateNote(
  pool: Pool,
  ownerId: string,
  noteId: string,
  patch: {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown> | null;
    type?: string;
  },
): Promise<WpnNoteDetail | null> {
  const cur = await wpnPgGetNoteById(pool, ownerId, noteId);
  if (!cur) return null;
  const title = patch.title !== undefined ? patch.title.trim() || cur.title : cur.title;
  const content = patch.content !== undefined ? patch.content : cur.content;
  const type = normalizeLegacyNoteType(
    patch.type !== undefined ? patch.type : cur.type,
  );
  let metadata_json: string | null =
    cur.metadata && Object.keys(cur.metadata).length > 0
      ? JSON.stringify(cur.metadata)
      : null;
  if (patch.metadata !== undefined) {
    metadata_json =
      patch.metadata && Object.keys(patch.metadata).length > 0
        ? JSON.stringify(patch.metadata)
        : null;
  }
  const updated_at_ms = nowMs();
  await pool.query(
    `UPDATE wpn_note n SET title = $1, content = $2, metadata_json = $3, type = $4, updated_at_ms = $5
     FROM wpn_project p INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE n.id = $6 AND n.project_id = p.id AND w.owner_id = $7`,
    [title, content, metadata_json, type, updated_at_ms, noteId, ownerId],
  );
  return wpnPgGetNoteById(pool, ownerId, noteId);
}

export async function wpnPgDeleteNotes(
  pool: Pool,
  ownerId: string,
  ids: string[],
): Promise<void> {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    await pool.query(
      `DELETE FROM wpn_note n USING wpn_project p, wpn_workspace w
       WHERE n.id = $1 AND n.project_id = p.id AND p.workspace_id = w.id AND w.owner_id = $2`,
      [id, ownerId],
    );
  }
}

async function persistTreePg(
  pool: Pool,
  projectId: string,
  childMap: Map<string | null, string[]>,
): Promise<void> {
  const t = nowMs();
  const walk = async (parentId: string | null, ids: string[]): Promise<void> => {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]!;
      await pool.query(
        "UPDATE wpn_note SET parent_id = $1, sibling_index = $2, updated_at_ms = $3 WHERE id = $4 AND project_id = $5",
        [parentId, i, t, id, projectId],
      );
      await walk(id, childMap.get(id) ?? []);
    }
  };
  await walk(null, childMap.get(null) ?? []);
}

export async function wpnPgMoveNote(
  pool: Pool,
  ownerId: string,
  projectId: string,
  draggedId: string,
  targetId: string,
  placement: NoteMovePlacement,
): Promise<void> {
  await requireWpnPgProject(pool, ownerId, projectId);
  const rows = await loadRows(pool, projectId);
  const childMap = wpnComputeChildMapAfterMove(rows, draggedId, targetId, placement);
  await persistTreePg(pool, projectId, childMap);
}

function collectSubtreePreorderPg(rows: WpnNoteRow[], rootId: string): string[] {
  const cm = childrenMapFromRows(rows);
  const out: string[] = [];
  const visit = (id: string): void => {
    out.push(id);
    for (const k of cm.get(id) ?? []) {
      visit(k.id);
    }
  };
  visit(rootId);
  return out;
}

export async function wpnPgDuplicateNoteSubtree(
  pool: Pool,
  ownerId: string,
  projectId: string,
  rootNoteId: string,
): Promise<{ newRootId: string }> {
  await requireWpnPgProject(pool, ownerId, projectId);
  const rows = await loadRows(pool, projectId);
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const rootRow = rowMap.get(rootNoteId);
  if (!rootRow) {
    throw new Error("Note not found");
  }
  const ordered = collectSubtreePreorderPg(rows, rootNoteId);
  const subtreeIds = new Set(ordered);
  const idMap = new Map<string, string>();
  for (const id of ordered) {
    idMap.set(id, newId());
  }
  const newRootId = idMap.get(rootNoteId)!;
  const P = rootRow.parent_id;
  const cmBefore = childrenMapFromRows(rows);
  const siblingsAtP = (cmBefore.get(P) ?? []).map((r) => r.id);
  const idxAtP = siblingsAtP.indexOf(rootNoteId);
  const newOrderAtP =
    idxAtP >= 0
      ? [...siblingsAtP.slice(0, idxAtP + 1), newRootId, ...siblingsAtP.slice(idxAtP + 1)]
      : [...siblingsAtP, newRootId];

  const t = nowMs();

  for (const oid of ordered) {
    const r = rowMap.get(oid)!;
    const nid = idMap.get(oid)!;
    const newParent =
      r.parent_id === null
        ? null
        : subtreeIds.has(r.parent_id)
          ? idMap.get(r.parent_id)!
          : r.parent_id;
    await pool.query(
      `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9)`,
      [nid, projectId, newParent, r.type, r.title, r.content, r.metadata_json, t, t],
    );
  }

  await applySiblingOrderPg(pool, projectId, newOrderAtP);

  for (const oid of ordered) {
    const kids = (cmBefore.get(oid) ?? []).filter((k) => subtreeIds.has(k.id));
    if (kids.length === 0) continue;
    const newPid = idMap.get(oid)!;
    const newKidOrder = kids.map((k) => idMap.get(k.id)!);
    await applySiblingOrderPg(pool, projectId, newKidOrder);
  }

  return { newRootId };
}

export async function wpnPgGetExplorerExpanded(
  pool: Pool,
  ownerId: string,
  projectId: string,
): Promise<string[]> {
  await requireWpnPgProject(pool, ownerId, projectId);
  const { rows } = await pool.query(
    `SELECT e.expanded_ids_json FROM wpn_explorer_state e
     INNER JOIN wpn_project p ON p.id = e.project_id
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE e.project_id = $1 AND w.owner_id = $2`,
    [projectId, ownerId],
  );
  const raw = rows[0] as { expanded_ids_json: string } | undefined;
  if (!raw?.expanded_ids_json) return [];
  try {
    const j = JSON.parse(raw.expanded_ids_json) as unknown;
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function wpnPgSetExplorerExpanded(
  pool: Pool,
  ownerId: string,
  projectId: string,
  expandedIds: string[],
): Promise<void> {
  await requireWpnPgProject(pool, ownerId, projectId);
  const json = JSON.stringify([...new Set(expandedIds)]);
  await pool.query(
    `INSERT INTO wpn_explorer_state (project_id, expanded_ids_json) VALUES ($1, $2)
     ON CONFLICT (project_id) DO UPDATE SET expanded_ids_json = EXCLUDED.expanded_ids_json`,
    [projectId, json],
  );
}

export async function wpnPgListAllNotesWithContext(
  pool: Pool,
  ownerId: string,
): Promise<WpnNoteWithContextListItem[]> {
  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.title, n.project_id,
            p.name AS project_name, p.workspace_id, w.name AS workspace_name
     FROM wpn_note n
     INNER JOIN wpn_project p ON p.id = n.project_id
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE w.owner_id = $1`,
    [ownerId],
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    type: normalizeLegacyNoteType(String(r.type)),
    title: String(r.title),
    project_id: String(r.project_id),
    project_name: String(r.project_name),
    workspace_id: String(r.workspace_id),
    workspace_name: String(r.workspace_name),
  }));
}

export async function wpnPgListBacklinksToNote(
  pool: Pool,
  ownerId: string,
  targetNoteId: string,
): Promise<WpnBacklinkSourceItem[]> {
  const { rows } = await pool.query(
    `SELECT n.id, n.title, n.content, n.project_id
     FROM wpn_note n
     INNER JOIN wpn_project p ON p.id = n.project_id
     INNER JOIN wpn_workspace w ON w.id = p.workspace_id
     WHERE w.owner_id = $1 AND n.id != $2`,
    [ownerId, targetNoteId],
  );
  const out: WpnBacklinkSourceItem[] = [];
  for (const row of rows as Record<string, unknown>[]) {
    const content = String(row.content ?? "");
    const refs = collectReferencedNoteIdsFromMarkdown(content);
    if (refs.has(targetNoteId)) {
      out.push({
        id: String(row.id),
        title: String(row.title),
        project_id: String(row.project_id),
      });
    }
  }
  return out;
}
