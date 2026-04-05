import type { Database } from "better-sqlite3";
import * as crypto from "crypto";
import { normalizeLegacyNoteType } from "../../shared/note-type-legacy";
import type { NoteMovePlacement } from "../../shared/nodex-renderer-api";
import { collectReferencedNoteIdsFromMarkdown } from "../../shared/markdown-internal-note-href";
import type {
  WpnBacklinkSourceItem,
  WpnNoteDetail,
  WpnNoteListItem,
  WpnNoteWithContextListItem,
} from "../../shared/wpn-v2-types";
import { wpnComputeChildMapAfterMove } from "./wpn-note-move";
import { wpnSqliteProjectOwnedBy } from "./wpn-sqlite-service";
import type { WpnNoteRow } from "./wpn-types";

function applySiblingOrder(
  db: Database,
  projectId: string,
  _parentId: string | null,
  orderedIds: string[],
): void {
  const t = nowMs();
  orderedIds.forEach((nid, i) => {
    db.prepare(
      "UPDATE wpn_note SET sibling_index = ?, updated_at_ms = ? WHERE id = ? AND project_id = ?",
    ).run(i, t, nid, projectId);
  });
}

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

function loadRows(db: Database, projectId: string): WpnNoteRow[] {
  const raw = db
    .prepare(
      `SELECT id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms
       FROM wpn_note WHERE project_id = ?`,
    )
    .all(projectId) as WpnNoteRow[];
  return raw.map((r) => ({ ...r, type: normalizeLegacyNoteType(r.type) }));
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

function requireWpnSqliteProject(db: Database, ownerId: string, projectId: string): void {
  if (!wpnSqliteProjectOwnedBy(db, ownerId, projectId)) {
    throw new Error("Project not found");
  }
}

/** Preorder with depth for explorer. */
export function wpnSqliteListNotesFlat(
  db: Database,
  ownerId: string,
  projectId: string,
): WpnNoteListItem[] {
  requireWpnSqliteProject(db, ownerId, projectId);
  const rows = loadRows(db, projectId);
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

export function wpnSqliteGetNoteById(
  db: Database,
  ownerId: string,
  noteId: string,
): WpnNoteDetail | null {
  const r = db
    .prepare(
      `SELECT n.id, n.project_id, n.parent_id, n.type, n.title, n.content, n.metadata_json, n.sibling_index, n.created_at_ms, n.updated_at_ms
       FROM wpn_note n
       INNER JOIN wpn_project p ON p.id = n.project_id
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE n.id = ? AND w.owner_id = ?`,
    )
    .get(noteId, ownerId) as WpnNoteRow | undefined;
  if (!r) return null;
  return {
    id: r.id,
    project_id: r.project_id,
    parent_id: r.parent_id,
    type: normalizeLegacyNoteType(r.type),
    title: r.title,
    content: r.content,
    metadata: parseMetadata(r.metadata_json),
    sibling_index: r.sibling_index,
    created_at_ms: r.created_at_ms,
    updated_at_ms: r.updated_at_ms,
  };
}

export function wpnSqliteCreateNote(
  db: Database,
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
): { id: string } {
  requireWpnSqliteProject(db, ownerId, projectId);
  const noteType = normalizeLegacyNoteType(payload.type);

  const rows = loadRows(db, projectId);
  const cm = childrenMapFromRows(rows);
  const id = newId();
  const t = nowMs();
  const title = (payload.title ?? "").trim() || "Untitled";
  const content = payload.content ?? "";
  const metadata_json =
    payload.metadata && Object.keys(payload.metadata).length > 0
      ? JSON.stringify(payload.metadata)
      : null;

  let parent_id: string | null = null;
  let sibling_index = 0;

  if (payload.relation === "root") {
    const roots = cm.get(null) ?? [];
    sibling_index = roots.length === 0 ? 0 : Math.max(...roots.map((r) => r.sibling_index)) + 1;
    parent_id = null;
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
      db.prepare(
        `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        id,
        projectId,
        parent_id,
        noteType,
        title,
        content,
        metadata_json,
        t,
        t,
      );
      applySiblingOrder(db, projectId, parent_id, orderedIds);
      return { id };
    }
  }

  db.prepare(
    `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  );
  return { id };
}

export function wpnSqliteUpdateNote(
  db: Database,
  ownerId: string,
  noteId: string,
  patch: {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown> | null;
    type?: string;
  },
): WpnNoteDetail | null {
  const cur = wpnSqliteGetNoteById(db, ownerId, noteId);
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
  db.prepare(
    `UPDATE wpn_note SET title = ?, content = ?, metadata_json = ?, type = ?, updated_at_ms = ?
     WHERE id = ? AND EXISTS (
       SELECT 1 FROM wpn_project p
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE p.id = wpn_note.project_id AND w.owner_id = ?
     )`,
  ).run(title, content, metadata_json, type, updated_at_ms, noteId, ownerId);
  return wpnSqliteGetNoteById(db, ownerId, noteId);
}

export function wpnSqliteDeleteNotes(db: Database, ownerId: string, ids: string[]): void {
  const unique = [...new Set(ids)];
  const del = db.prepare(
    `DELETE FROM wpn_note WHERE id = ? AND EXISTS (
       SELECT 1 FROM wpn_project p
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE p.id = wpn_note.project_id AND w.owner_id = ?
     )`,
  );
  for (const id of unique) {
    del.run(id, ownerId);
  }
}

function persistTree(db: Database, projectId: string, childMap: Map<string | null, string[]>): void {
  const t = nowMs();
  const walk = (parentId: string | null, ids: string[]): void => {
    ids.forEach((id, i) => {
      db.prepare(
        "UPDATE wpn_note SET parent_id = ?, sibling_index = ?, updated_at_ms = ? WHERE id = ? AND project_id = ?",
      ).run(parentId, i, t, id, projectId);
      walk(id, childMap.get(id) ?? []);
    });
  };
  walk(null, childMap.get(null) ?? []);
}

export function wpnSqliteMoveNote(
  db: Database,
  ownerId: string,
  projectId: string,
  draggedId: string,
  targetId: string,
  placement: NoteMovePlacement,
): void {
  if (draggedId === targetId) return;
  requireWpnSqliteProject(db, ownerId, projectId);
  const rows = loadRows(db, projectId);
  const childMap = wpnComputeChildMapAfterMove(rows, draggedId, targetId, placement);
  persistTree(db, projectId, childMap);
}

/** Preorder: parent before descendants (for subtree rooted at `rootId`). */
function collectSubtreePreorder(rows: WpnNoteRow[], rootId: string): string[] {
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

/** Clone `rootNoteId` and all descendants with new IDs; insert duplicate root immediately after the original among siblings. */
export function wpnSqliteDuplicateNoteSubtree(
  db: Database,
  ownerId: string,
  projectId: string,
  rootNoteId: string,
): { newRootId: string } {
  requireWpnSqliteProject(db, ownerId, projectId);
  const rows = loadRows(db, projectId);
  const rowMap = new Map(rows.map((r) => [r.id, r]));
  const rootRow = rowMap.get(rootNoteId);
  if (!rootRow) {
    throw new Error("Note not found");
  }
  const ordered = collectSubtreePreorder(rows, rootNoteId);
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
  const ins = db.prepare(
    `INSERT INTO wpn_note (id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  );

  for (const oid of ordered) {
    const r = rowMap.get(oid)!;
    const nid = idMap.get(oid)!;
    const newParent =
      r.parent_id === null
        ? null
        : subtreeIds.has(r.parent_id)
          ? idMap.get(r.parent_id)!
          : r.parent_id;
    ins.run(
      nid,
      projectId,
      newParent,
      r.type,
      r.title,
      r.content,
      r.metadata_json,
      t,
      t,
    );
  }

  applySiblingOrder(db, projectId, P, newOrderAtP);

  for (const oid of ordered) {
    const kids = (cmBefore.get(oid) ?? []).filter((k) => subtreeIds.has(k.id));
    if (kids.length === 0) continue;
    const newPid = idMap.get(oid)!;
    const newKidOrder = kids.map((k) => idMap.get(k.id)!);
    applySiblingOrder(db, projectId, newPid, newKidOrder);
  }

  return { newRootId };
}

export function wpnSqliteGetExplorerExpanded(
  db: Database,
  ownerId: string,
  projectId: string,
): string[] {
  requireWpnSqliteProject(db, ownerId, projectId);
  const row = db
    .prepare("SELECT expanded_ids_json FROM wpn_explorer_state WHERE project_id = ?")
    .get(projectId) as { expanded_ids_json: string } | undefined;
  if (!row?.expanded_ids_json) return [];
  try {
    const j = JSON.parse(row.expanded_ids_json) as unknown;
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function wpnSqliteSetExplorerExpanded(
  db: Database,
  ownerId: string,
  projectId: string,
  expandedIds: string[],
): void {
  requireWpnSqliteProject(db, ownerId, projectId);
  const json = JSON.stringify([...new Set(expandedIds)]);
  db.prepare(
    `INSERT INTO wpn_explorer_state (project_id, expanded_ids_json)
     VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET expanded_ids_json = excluded.expanded_ids_json`,
  ).run(projectId, json);
}

/** All notes for the owner with workspace/project names (unordered). */
export function wpnSqliteListAllNotesWithContext(
  db: Database,
  ownerId: string,
): WpnNoteWithContextListItem[] {
  const rows = db
    .prepare(
      `SELECT n.id AS id, n.type AS type, n.title AS title, n.project_id AS project_id,
              p.name AS project_name, p.workspace_id AS workspace_id, w.name AS workspace_name
       FROM wpn_note n
       INNER JOIN wpn_project p ON p.id = n.project_id
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE w.owner_id = ?`,
    )
    .all(ownerId) as {
    id: string;
    type: string;
    title: string;
    project_id: string;
    project_name: string;
    workspace_id: string;
    workspace_name: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    type: normalizeLegacyNoteType(r.type),
    title: r.title,
    project_id: r.project_id,
    project_name: r.project_name,
    workspace_id: r.workspace_id,
    workspace_name: r.workspace_name,
  }));
}

export function wpnSqliteGetNoteWithContextById(
  db: Database,
  ownerId: string,
  noteId: string,
): WpnNoteWithContextListItem | null {
  const r = db
    .prepare(
      `SELECT n.id AS id, n.type AS type, n.title AS title, n.project_id AS project_id,
              p.name AS project_name, p.workspace_id AS workspace_id, w.name AS workspace_name
       FROM wpn_note n
       INNER JOIN wpn_project p ON p.id = n.project_id
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE n.id = ? AND w.owner_id = ?`,
    )
    .get(noteId, ownerId) as
    | {
        id: string;
        type: string;
        title: string;
        project_id: string;
        project_name: string;
        workspace_id: string;
        workspace_name: string;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    type: normalizeLegacyNoteType(r.type),
    title: r.title,
    project_id: r.project_id,
    project_name: r.project_name,
    workspace_id: r.workspace_id,
    workspace_name: r.workspace_name,
  };
}

/** Id + content for every note owned by `ownerId` (cross-workspace). */
export function wpnSqliteListAllNoteContentsForOwner(
  db: Database,
  ownerId: string,
): { id: string; content: string }[] {
  const rows = db
    .prepare(
      `SELECT n.id AS id, n.content AS content
       FROM wpn_note n
       INNER JOIN wpn_project p ON p.id = n.project_id
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE w.owner_id = ?`,
    )
    .all(ownerId) as { id: string; content: string }[];
  return rows;
}

export function wpnSqliteListBacklinksToNote(
  db: Database,
  ownerId: string,
  targetNoteId: string,
): WpnBacklinkSourceItem[] {
  const rows = db
    .prepare(
      `SELECT n.id AS id, n.title AS title, n.content AS content, n.project_id AS project_id
       FROM wpn_note n
       INNER JOIN wpn_project p ON p.id = n.project_id
       INNER JOIN wpn_workspace w ON w.id = p.workspace_id
       WHERE w.owner_id = ? AND n.id != ?`,
    )
    .all(ownerId, targetNoteId) as { id: string; title: string; content: string; project_id: string }[];

  const out: WpnBacklinkSourceItem[] = [];
  for (const r of rows) {
    const refs = collectReferencedNoteIdsFromMarkdown(r.content ?? "");
    if (refs.has(targetNoteId)) {
      out.push({ id: r.id, title: r.title, project_id: r.project_id });
    }
  }
  return out;
}
