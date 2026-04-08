import { createSyncBaseUrlResolver } from "@nodex/platform";
import { getNodex } from "../../../../../shared/nodex-host-access";
import type { Note } from "@nodex/ui-types";

const resolveSyncApiBaseForBundled = createSyncBaseUrlResolver();

async function fetchBundledDocFromSyncPublic(logicalId: string): Promise<Note | null> {
  const base = resolveSyncApiBaseForBundled().trim().replace(/\/$/, "");
  if (!base) {
    return null;
  }
  try {
    const url = `${base}/public/bundled-docs/notes/${encodeURIComponent(logicalId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const j = (await res.json()) as { note?: Note };
    if (j.note && typeof (j.note as { id?: unknown }).id === "string") {
      return j.note as Note;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Loads a bundled documentation note by logical id: tries legacy notes first, then
 * sync-api public `/public/bundled-docs/notes/:id` (web / no local seed), then
 * `wpn-docs:{workspaceId}:{logicalId}` in the first WPN workspace.
 */
export async function fetchBundledDocumentationNote(logicalId: string): Promise<Note> {
  try {
    const n = await getNodex().getNote(logicalId);
    if (n && typeof (n as { id?: unknown }).id === "string") {
      return n as unknown as Note;
    }
  } catch {
    /* try sync public / WPN composite id */
  }

  const fromSyncPublic = await fetchBundledDocFromSyncPublic(logicalId);
  if (fromSyncPublic) {
    return fromSyncPublic;
  }

  const { workspaces } = await getNodex().wpnListWorkspaces();
  const ws0 = workspaces[0];
  if (!ws0) {
    throw new Error("No workspace available to load bundled documentation.");
  }
  const noteId = `wpn-docs:${ws0.id}:${logicalId}`;
  const r = await getNodex().wpnGetNote(noteId);
  return r.note as unknown as Note;
}
