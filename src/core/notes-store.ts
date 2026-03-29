import { randomUUID } from "crypto";
import {
  PLUGIN_UI_METADATA_KEY,
  validatePluginUiStateSize,
} from "../shared/plugin-state-protocol";

export type NoteRecord = {
  id: string;
  parentId: string | null;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type NoteListRow = {
  id: string;
  type: string;
  title: string;
  parentId: string | null;
  depth: number;
};

export type NoteMovePlacement = "before" | "after" | "into";

const ROOT_KEY = "__root__";

function orderKey(parentId: string | null): string {
  return parentId ?? ROOT_KEY;
}

const notes = new Map<string, NoteRecord>();
const childOrder = new Map<string, string[]>();

function getChildren(parentId: string | null): string[] {
  return childOrder.get(orderKey(parentId)) ?? [];
}

function setChildren(parentId: string | null, ids: string[]): void {
  childOrder.set(orderKey(parentId), ids);
}

/** Rebuild `childOrder` for the synthetic null parent from `parentId` on records (fixes missing `__root__`). */
function syncNullChildOrderFromRecords(): void {
  const roots: string[] = [];
  for (const n of notes.values()) {
    if (n.parentId === null) {
      roots.push(n.id);
    }
  }
  if (roots.length > 0) {
    setChildren(null, roots);
  }
}

export function resetNotesStore(): void {
  notes.clear();
  childOrder.clear();
}

const defaultSampleContent: Record<
  string,
  { content: string; metadata?: Record<string, unknown> }
> = {
  root: {
    content:
      "# Welcome to Nodex\n\nThis **Home** note is the workspace root — use it as your documentation landing page.\n\n## Tips\n\n- Add child notes for topics, specs, and runbooks.\n- Use **Markdown** notes for readable docs; other note types showcase plugins.\n- The tree on the left is your single outline for everything in this workspace.\n\n---\n\n_Edit this page anytime to match your project._",
  },
  markdown: {
    content:
      "# Hello World\n\nThis is a **markdown** note rendered by a plugin!\n\n## Features\n\n- Dynamic plugin loading\n- Component registry\n- Hot reload support",
  },
  text: {
    content:
      "<h1>Rich Text Editor</h1><p>This note uses <strong>Tiptap</strong> for rich text editing.</p>",
  },
  code: {
    content:
      'function hello() {\n  console.log("Hello from Monaco!");\n}\n\nhello();',
    metadata: { language: "javascript" },
  },
};

const defaultTypeToTitle: Record<string, string> = {
  root: "Home",
  markdown: "Markdown Note",
  text: "Rich Text Note",
  code: "Code Editor",
};

function titleForType(type: string): string {
  return (
    defaultTypeToTitle[type] ||
    `${type.charAt(0).toUpperCase() + type.slice(1)} Note`
  );
}

function bodyForType(type: string): {
  content: string;
  metadata?: Record<string, unknown>;
} {
  const sc = defaultSampleContent[type];
  return {
    content: sc?.content || `Sample content for ${type}`,
    metadata: sc?.metadata,
  };
}

/** True if `nodeId` is strictly inside the subtree rooted at `ancestorId` (not equal). */
export function isDescendantOf(ancestorId: string, nodeId: string): boolean {
  let p = notes.get(nodeId)?.parentId ?? null;
  while (p) {
    if (p === ancestorId) {
      return true;
    }
    p = notes.get(p)?.parentId ?? null;
  }
  return false;
}

/** Repair `childOrder` for `null` parent from `parentId` on records. */
export function mergeMultipleRootsIfNeeded(): void {
  syncNullChildOrderFromRecords();
}

export function ensureNotesSeeded(registeredTypes: string[]): void {
  if (notes.size > 0) {
    return;
  }
  if (registeredTypes.length === 0) {
    return;
  }
  const rootType = registeredTypes.includes("root")
    ? "root"
    : registeredTypes[0]!;
  const { content: rootContent, metadata: rootMeta } = bodyForType(rootType);
  const rootTitle =
    rootType === "root" ? "Home" : "Workspace";
  const topLevelIds: string[] = [];
  const homeId = randomUUID();
  notes.set(homeId, {
    id: homeId,
    parentId: null,
    type: rootType,
    title: rootTitle,
    content: rootContent,
    metadata: rootMeta,
  });
  topLevelIds.push(homeId);
  const childTypes = registeredTypes.filter((t) => t !== "root");
  for (const type of childTypes) {
    const id = randomUUID();
    const { content, metadata } = bodyForType(type);
    notes.set(id, {
      id,
      parentId: null,
      type,
      title: titleForType(type),
      content,
      metadata,
    });
    topLevelIds.push(id);
  }
  setChildren(null, topLevelIds);
}

export function getNotesFlat(): NoteListRow[] {
  if (notes.size > 0 && getChildren(null).length === 0) {
    syncNullChildOrderFromRecords();
  }
  const out: NoteListRow[] = [];
  function walk(parentId: string | null, depth: number): void {
    for (const id of getChildren(parentId)) {
      const n = notes.get(id);
      if (!n) {
        continue;
      }
      out.push({
        id: n.id,
        type: n.type,
        title: n.title,
        parentId: n.parentId,
        depth,
      });
      walk(id, depth + 1);
    }
  }
  walk(null, 0);
  return out;
}

export function getNoteById(noteId: string): NoteRecord | null {
  return notes.get(noteId) ?? null;
}

export function getFirstNote(): NoteRecord | null {
  const flat = getNotesFlat();
  if (flat.length === 0) {
    return null;
  }
  return notes.get(flat[0]!.id) ?? null;
}

function removeFromParentList(noteId: string): void {
  const n = notes.get(noteId);
  if (!n) {
    return;
  }
  const p = n.parentId;
  const list = [...getChildren(p)];
  const i = list.indexOf(noteId);
  if (i >= 0) {
    list.splice(i, 1);
    setChildren(p, list);
  }
}

function collectSubtreeIds(rootId: string): string[] {
  const out: string[] = [];
  function walk(id: string): void {
    out.push(id);
    for (const c of getChildren(id)) {
      walk(c);
    }
  }
  walk(rootId);
  return out;
}

/** Remove a note and its descendants (any top-level note may be removed). */
export function deleteNoteSubtree(noteId: string): void {
  if (!notes.get(noteId)) {
    throw new Error("Note not found");
  }
  const ids = collectSubtreeIds(noteId);
  removeFromParentList(noteId);
  for (const id of ids) {
    childOrder.delete(orderKey(id));
  }
  for (const id of ids) {
    notes.delete(id);
  }
  syncNullChildOrderFromRecords();
}

/**
 * Delete several subtrees. Accepts any superset of ids; keeps only top-level roots
 * among the set, then deletes in reverse preorder so nested selections work.
 */
export function deleteNoteSubtrees(rootIds: string[]): void {
  const unique = [...new Set(rootIds)];
  const uniqueSet = new Set(unique);
  const minimal = unique.filter((id) => {
    let p = notes.get(id)?.parentId ?? null;
    while (p) {
      if (uniqueSet.has(p)) {
        return false;
      }
      p = notes.get(p)?.parentId ?? null;
    }
    return true;
  });
  const flat = getNotesFlat();
  const indexById = new Map(flat.map((r, i) => [r.id, i]));
  minimal.sort(
    (a, b) => (indexById.get(b) ?? 0) - (indexById.get(a) ?? 0),
  );
  for (const id of minimal) {
    if (notes.has(id)) {
      deleteNoteSubtree(id);
    }
  }
}

/**
 * Move multiple disjoint subtree roots in one step, preserving preorder order within the block.
 */
export function moveNotesBulk(
  noteIds: string[],
  targetId: string,
  placement: NoteMovePlacement,
): void {
  const idSet = new Set(noteIds);
  const minimal: string[] = [];
  for (const id of noteIds) {
    if (!notes.get(id)) {
      throw new Error("Note not found");
    }
    let p: string | null = notes.get(id)?.parentId ?? null;
    let underSelected = false;
    while (p) {
      if (idSet.has(p)) {
        underSelected = true;
        break;
      }
      p = notes.get(p)?.parentId ?? null;
    }
    if (!underSelected) {
      minimal.push(id);
    }
  }

  const uniqueMinimal = [...new Set(minimal)];
  if (uniqueMinimal.length === 0) {
    return;
  }

  const flat = getNotesFlat();
  const indexById = new Map(flat.map((r, i) => [r.id, i]));
  uniqueMinimal.sort(
    (a, b) => (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0),
  );

  const target = notes.get(targetId);
  if (!target) {
    throw new Error("Note not found");
  }

  for (const r of uniqueMinimal) {
    if (r === targetId) {
      throw new Error("Invalid move target");
    }
    if (isDescendantOf(r, targetId)) {
      throw new Error("Cannot move relative to node inside dragged subtree");
    }
  }

  if (placement === "into") {
    for (const r of uniqueMinimal) {
      if (isDescendantOf(targetId, r)) {
        throw new Error("Cannot move into own subtree");
      }
    }
  }

  const sortedRemove = [...uniqueMinimal].sort(
    (a, b) => (indexById.get(b) ?? 0) - (indexById.get(a) ?? 0),
  );
  for (const r of sortedRemove) {
    removeFromParentList(r);
  }

  const block = uniqueMinimal;

  if (placement === "into") {
    const kids = [...getChildren(targetId)];
    for (const r of block) {
      const rec = notes.get(r);
      if (rec) {
        rec.parentId = targetId;
        kids.push(r);
      }
    }
    setChildren(targetId, kids);
    return;
  }

  const parentId = target.parentId;
  const siblings = [...getChildren(parentId)];
  const tIdx = siblings.indexOf(targetId);
  const ins = placement === "before" ? tIdx : tIdx + 1;
  for (const r of block) {
    const rec = notes.get(r);
    if (rec) {
      rec.parentId = parentId;
    }
  }
  if (tIdx < 0) {
    siblings.push(...block);
  } else {
    siblings.splice(ins, 0, ...block);
  }
  setChildren(parentId, siblings);
}

export function moveNote(
  draggedId: string,
  targetId: string,
  placement: NoteMovePlacement,
): void {
  if (draggedId === targetId) {
    return;
  }

  const dragged = notes.get(draggedId);
  const target = notes.get(targetId);
  if (!dragged || !target) {
    throw new Error("Note not found");
  }

  if (isDescendantOf(draggedId, targetId)) {
    throw new Error("Cannot move into own subtree");
  }

  removeFromParentList(draggedId);

  if (placement === "into") {
    const kids = [...getChildren(targetId)];
    kids.push(draggedId);
    dragged.parentId = targetId;
    setChildren(targetId, kids);
    return;
  }

  const parentId = target.parentId;
  const siblings = [...getChildren(parentId)];
  const tIdx = siblings.indexOf(targetId);
  if (tIdx < 0) {
    siblings.push(draggedId);
    dragged.parentId = parentId;
    setChildren(parentId, siblings);
    return;
  }
  const ins = placement === "before" ? tIdx : tIdx + 1;
  siblings.splice(ins, 0, draggedId);
  dragged.parentId = parentId;
  setChildren(parentId, siblings);
}

function insertClonedRootAt(
  cloneRootId: string,
  targetId: string,
  placement: NoteMovePlacement,
): void {
  const cloneRoot = notes.get(cloneRootId);
  if (!cloneRoot) {
    throw new Error("Clone missing");
  }
  const target = notes.get(targetId);
  if (!target) {
    throw new Error("Target not found");
  }
  if (placement === "into") {
    const kids = [...getChildren(targetId)];
    kids.push(cloneRootId);
    cloneRoot.parentId = targetId;
    setChildren(targetId, kids);
    return;
  }
  const parentId = target.parentId;
  const siblings = [...getChildren(parentId)];
  const tIdx = siblings.indexOf(targetId);
  const ins = placement === "before" ? tIdx : tIdx + 1;
  if (tIdx < 0) {
    siblings.push(cloneRootId);
  } else {
    siblings.splice(ins, 0, cloneRootId);
  }
  cloneRoot.parentId = parentId;
  setChildren(parentId, siblings);
}

/** Deep-clone `sourceRootId` with new ids, then attach the clone at `targetId`. */
export function duplicateSubtreeAt(
  sourceRootId: string,
  targetId: string,
  placement: NoteMovePlacement,
): { newRootId: string } {
  const source = notes.get(sourceRootId);
  const target = notes.get(targetId);
  if (!source || !target) {
    throw new Error("Note not found");
  }

  function cloneRecursive(oldId: string): string {
    const old = notes.get(oldId)!;
    const newId = randomUUID();
    const oldChildIds = [...getChildren(oldId)];
    const newChildIds = oldChildIds.map(cloneRecursive);
    notes.set(newId, {
      id: newId,
      parentId: null,
      type: old.type,
      title: old.title,
      content: old.content,
      metadata: old.metadata ? { ...old.metadata } : undefined,
    });
    setChildren(newId, newChildIds);
    for (const cid of newChildIds) {
      const c = notes.get(cid)!;
      c.parentId = newId;
    }
    return newId;
  }

  const newRootId = cloneRecursive(sourceRootId);
  insertClonedRootAt(newRootId, targetId, placement);
  return { newRootId };
}

export function createNote(opts: {
  anchorId?: string;
  relation: "child" | "sibling" | "root";
  type: string;
}): NoteRecord {
  const id = randomUUID();
  const { content, metadata } = bodyForType(opts.type);
  const rec: NoteRecord = {
    id,
    parentId: null,
    type: opts.type,
    title: titleForType(opts.type),
    content,
    metadata,
  };

  /** "Root" relation = new top-level note (forest), not a child of a single workspace root. */
  if (opts.relation === "root") {
    rec.parentId = null;
    notes.set(id, rec);
    const ch = [...getChildren(null), id];
    setChildren(null, ch);
    return rec;
  }

  if (!opts.anchorId) {
    throw new Error("Anchor note required");
  }

  const anchor = notes.get(opts.anchorId);
  if (!anchor) {
    throw new Error("Note not found");
  }

  if (opts.relation === "child") {
    rec.parentId = opts.anchorId;
    notes.set(id, rec);
    const ch = [...getChildren(opts.anchorId), id];
    setChildren(opts.anchorId, ch);
    return rec;
  }

  const parentId = anchor.parentId;
  rec.parentId = parentId;
  notes.set(id, rec);
  const siblings = [...getChildren(parentId)];
  const idx = siblings.indexOf(opts.anchorId);
  if (idx === -1) {
    siblings.push(id);
  } else {
    siblings.splice(idx + 1, 0, id);
  }
  setChildren(parentId, siblings);
  return rec;
}

export function renameNote(id: string, title: string): void {
  const n = notes.get(id);
  if (!n) {
    throw new Error("Note not found");
  }
  const t = title.trim();
  if (!t) {
    throw new Error("Title is required");
  }
  n.title = t;
}

const MAX_NOTE_CONTENT_CHARS = 5_000_000;

/** Update note body (iframe editors call via host IPC). */
export function setNoteContent(noteId: string, content: string): void {
  if (typeof content !== "string") {
    throw new Error("Content must be a string");
  }
  if (content.length > MAX_NOTE_CONTENT_CHARS) {
    throw new Error(
      `Content exceeds maximum length (${MAX_NOTE_CONTENT_CHARS} characters)`,
    );
  }
  const n = notes.get(noteId);
  if (!n) {
    throw new Error("Note not found");
  }
  n.content = content;
}

/** Persist plugin iframe UI snapshot under `metadata.pluginUiState`. */
export function setNotePluginUiState(noteId: string, state: unknown): void {
  const err = validatePluginUiStateSize(state);
  if (err) {
    throw new Error(err);
  }
  const n = notes.get(noteId);
  if (!n) {
    throw new Error("Note not found");
  }
  const meta: Record<string, unknown> = { ...(n.metadata ?? {}) };
  meta[PLUGIN_UI_METADATA_KEY] = state;
  n.metadata = meta;
}

export type SerializedNotesState = {
  v: 1;
  records: NoteRecord[];
  order: Record<string, string[]>;
};

export function exportSerializedState(): SerializedNotesState {
  return {
    v: 1,
    records: Array.from(notes.values()),
    order: Object.fromEntries(childOrder.entries()),
  };
}

export function importSerializedState(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }
  const d = data as Partial<SerializedNotesState>;
  if (d.v !== 1 || !Array.isArray(d.records) || !d.order || typeof d.order !== "object") {
    return false;
  }
  notes.clear();
  childOrder.clear();
  for (const r of d.records) {
    if (!r?.id || typeof r.type !== "string") {
      continue;
    }
    notes.set(r.id, {
      id: r.id,
      parentId: r.parentId ?? null,
      type: r.type,
      title: typeof r.title === "string" ? r.title : "Untitled",
      content: typeof r.content === "string" ? r.content : "",
      metadata: r.metadata,
    });
  }
  for (const [k, v] of Object.entries(d.order)) {
    if (Array.isArray(v)) {
      childOrder.set(k, v.filter((x) => typeof x === "string"));
    }
  }
  return notes.size > 0;
}
