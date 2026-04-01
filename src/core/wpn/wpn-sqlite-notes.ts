import type { Database } from "better-sqlite3";
import * as crypto from "crypto";
import type { NoteMovePlacement } from "../../shared/nodex-renderer-api";
import type { WpnNoteDetail, WpnNoteListItem } from "../../shared/wpn-v2-types";
import { wpnComputeChildMapAfterMove } from "./wpn-note-move";
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
  return db
    .prepare(
      `SELECT id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms
       FROM wpn_note WHERE project_id = ?`,
    )
    .all(projectId) as WpnNoteRow[];
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

/** Preorder with depth for explorer. */
export function wpnSqliteListNotesFlat(db: Database, projectId: string): WpnNoteListItem[] {
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

export function wpnSqliteGetNoteById(db: Database, noteId: string): WpnNoteDetail | null {
  const r = db
    .prepare(
      `SELECT id, project_id, parent_id, type, title, content, metadata_json, sibling_index, created_at_ms, updated_at_ms
       FROM wpn_note WHERE id = ?`,
    )
    .get(noteId) as WpnNoteRow | undefined;
  if (!r) return null;
  return {
    id: r.id,
    project_id: r.project_id,
    parent_id: r.parent_id,
    type: r.type,
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
  const proj = db.prepare("SELECT id FROM wpn_project WHERE id = ?").get(projectId);
  if (!proj) {
    throw new Error("Project not found");
  }
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
        payload.type,
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
    payload.type,
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
  noteId: string,
  patch: {
    title?: string;
    content?: string;
    metadata?: Record<string, unknown> | null;
    type?: string;
  },
): WpnNoteDetail | null {
  const cur = wpnSqliteGetNoteById(db, noteId);
  if (!cur) return null;
  const title = patch.title !== undefined ? patch.title.trim() || cur.title : cur.title;
  const content = patch.content !== undefined ? patch.content : cur.content;
  const type = patch.type !== undefined ? patch.type : cur.type;
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
    `UPDATE wpn_note SET title = ?, content = ?, metadata_json = ?, type = ?, updated_at_ms = ? WHERE id = ?`,
  ).run(title, content, metadata_json, type, updated_at_ms, noteId);
  return wpnSqliteGetNoteById(db, noteId);
}

export function wpnSqliteDeleteNotes(db: Database, ids: string[]): void {
  const unique = [...new Set(ids)];
  for (const id of unique) {
    db.prepare("DELETE FROM wpn_note WHERE id = ?").run(id);
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
  projectId: string,
  draggedId: string,
  targetId: string,
  placement: NoteMovePlacement,
): void {
  if (draggedId === targetId) return;
  const rows = loadRows(db, projectId);
  const childMap = wpnComputeChildMapAfterMove(rows, draggedId, targetId, placement);
  persistTree(db, projectId, childMap);
}

export function wpnSqliteGetExplorerExpanded(db: Database, projectId: string): string[] {
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
  projectId: string,
  expandedIds: string[],
): void {
  const proj = db.prepare("SELECT id FROM wpn_project WHERE id = ?").get(projectId);
  if (!proj) throw new Error("Project not found");
  const json = JSON.stringify([...new Set(expandedIds)]);
  db.prepare(
    `INSERT INTO wpn_explorer_state (project_id, expanded_ids_json)
     VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET expanded_ids_json = excluded.expanded_ids_json`,
  ).run(projectId, json);
}
