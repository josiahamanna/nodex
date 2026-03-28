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

export function resetNotesStore(): void {
  notes.clear();
  childOrder.clear();
}

const defaultSampleContent: Record<
  string,
  { content: string; metadata?: Record<string, unknown> }
> = {
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

export function getTreeRootId(): string | null {
  let found: string | null = null;
  for (const [id, n] of notes) {
    if (n.parentId === null) {
      if (found !== null) {
        return null;
      }
      found = id;
    }
  }
  return found;
}

/** If multiple roots exist (legacy data), reparent extras under the first root. */
export function mergeMultipleRootsIfNeeded(): void {
  const roots: string[] = [];
  for (const [id, n] of notes) {
    if (n.parentId === null) {
      roots.push(id);
    }
  }
  if (roots.length <= 1) {
    return;
  }
  const keeper = roots[0]!;
  const tail = roots.slice(1);
  const kids = [...getChildren(keeper), ...tail];
  setChildren(keeper, kids);
  for (const id of tail) {
    const r = notes.get(id);
    if (r) {
      r.parentId = keeper;
    }
  }
}

export function ensureNotesSeeded(registeredTypes: string[]): void {
  if (notes.size > 0) {
    return;
  }
  if (registeredTypes.length === 0) {
    return;
  }
  const rootType = registeredTypes[0]!;
  const { content: rootContent, metadata: rootMeta } = bodyForType(rootType);
  const rootId = randomUUID();
  notes.set(rootId, {
    id: rootId,
    parentId: null,
    type: rootType,
    title: "Workspace",
    content: rootContent,
    metadata: rootMeta,
  });
  const childIds: string[] = [];
  for (const type of registeredTypes) {
    const id = randomUUID();
    const { content, metadata } = bodyForType(type);
    notes.set(id, {
      id,
      parentId: rootId,
      type,
      title: titleForType(type),
      content,
      metadata,
    });
    childIds.push(id);
  }
  setChildren(rootId, childIds);
}

export function getNotesFlat(): NoteListRow[] {
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

export function moveNote(
  draggedId: string,
  targetId: string,
  placement: NoteMovePlacement,
): void {
  const workspaceRootId = getTreeRootId();
  if (!workspaceRootId) {
    throw new Error("No workspace root");
  }
  if (draggedId === workspaceRootId) {
    throw new Error("Cannot move the workspace root");
  }
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

  if (targetId === workspaceRootId) {
    const kids = [...getChildren(workspaceRootId)];
    if (placement === "before") {
      kids.unshift(draggedId);
    } else {
      kids.push(draggedId);
    }
    dragged.parentId = workspaceRootId;
    setChildren(workspaceRootId, kids);
    return;
  }

  const parentId = target.parentId ?? workspaceRootId;
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
  workspaceRootId: string,
): void {
  const cloneRoot = notes.get(cloneRootId);
  if (!cloneRoot) {
    throw new Error("Clone missing");
  }
  if (placement === "into") {
    const kids = [...getChildren(targetId)];
    kids.push(cloneRootId);
    cloneRoot.parentId = targetId;
    setChildren(targetId, kids);
    return;
  }
  if (targetId === workspaceRootId) {
    const kids = [...getChildren(workspaceRootId)];
    if (placement === "before") {
      kids.unshift(cloneRootId);
    } else {
      kids.push(cloneRootId);
    }
    cloneRoot.parentId = workspaceRootId;
    setChildren(workspaceRootId, kids);
    return;
  }
  const target = notes.get(targetId)!;
  const parentId = target.parentId ?? workspaceRootId;
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
  const workspaceRootId = getTreeRootId();
  if (!workspaceRootId) {
    throw new Error("No workspace root");
  }
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
  insertClonedRootAt(newRootId, targetId, placement, workspaceRootId);
  return { newRootId };
}

export function createNote(opts: {
  anchorId?: string;
  relation: "child" | "sibling" | "root";
  type: string;
}): NoteRecord {
  const workspaceRootId = getTreeRootId();
  if (!workspaceRootId) {
    throw new Error("No workspace root");
  }

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

  if (opts.relation === "root") {
    rec.parentId = workspaceRootId;
    const ch = [...getChildren(workspaceRootId), id];
    setChildren(workspaceRootId, ch);
    notes.set(id, rec);
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
    const ch = [...getChildren(opts.anchorId), id];
    setChildren(opts.anchorId, ch);
    notes.set(id, rec);
    return rec;
  }

  const parentId = anchor.parentId ?? workspaceRootId;
  rec.parentId = parentId;
  const siblings = [...getChildren(parentId)];
  const idx = siblings.indexOf(opts.anchorId);
  if (idx === -1) {
    siblings.push(id);
  } else {
    siblings.splice(idx + 1, 0, id);
  }
  setChildren(parentId, siblings);
  notes.set(id, rec);
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
