/**
 * Group notes + per-project Assets into one collapsible section per workspace root.
 * Primary folder has no mount row; added folders use a synthetic mount id for DnD only — the header UI matches primary (folder label).
 */

import type { NoteListItem } from "../preload";

export type SidebarNoteRow = {
  kind: "note";
  note: NoteListItem;
};

export type SidebarAssetsRow = {
  kind: "assets";
  projectRoot: string;
  depth: number;
  key: string;
};

export type SidebarRow = SidebarNoteRow | SidebarAssetsRow;

export type SidebarWorkspaceSection = {
  projectRoot: string;
  /** Stable id for localStorage (resolved path) */
  sectionKey: string;
  /** Added-folder mount row; rendered as section header + DnD target. Null for primary. */
  mountNote: NoteListItem | null;
  /** Subtract from row depth for padding inside this section (hides mount level). */
  depthTrim: number;
  innerRows: SidebarRow[];
};

function isMountId(id: string): boolean {
  return /^__nodex_mount_\d+$/.test(id);
}

function mountSlot(id: string): number {
  const m = /^__nodex_mount_(\d+)$/.exec(id);
  return m ? Number(m[1]) : 0;
}

/** @deprecated Use buildWorkspaceSidebarSections for UI; kept for single-list callers if any */
export function mergeNotesWithProjectAssetsRows(
  visibleNotes: NoteListItem[],
  workspaceRoots: string[],
): SidebarRow[] {
  const sections = buildWorkspaceSidebarSections(visibleNotes, workspaceRoots);
  const out: SidebarRow[] = [];
  for (const s of sections) {
    if (s.mountNote) {
      out.push({ kind: "note", note: s.mountNote });
    }
    out.push(...s.innerRows);
  }
  return out;
}

/**
 * Split merged visible notes into one section per disk root (notes + assets for that root).
 * Mount header rows are excluded from innerRows; pass as mountNote for section chrome.
 */
export function buildWorkspaceSidebarSections(
  visibleNotes: NoteListItem[],
  workspaceRoots: string[],
): SidebarWorkspaceSection[] {
  if (workspaceRoots.length === 0) {
    return [];
  }

  const sections: SidebarWorkspaceSection[] = [];
  const firstMount = visibleNotes.findIndex((n) => isMountId(n.id));
  const primaryEnd = firstMount === -1 ? visibleNotes.length : firstMount;
  const root0 = workspaceRoots[0]!;

  const primaryInner: SidebarRow[] = [];
  for (let j = 0; j < primaryEnd; j++) {
    primaryInner.push({ kind: "note", note: visibleNotes[j]! });
  }
  const primaryNoteDepth =
    primaryEnd > 0 ? Math.min(...visibleNotes.slice(0, primaryEnd).map((n) => n.depth)) : 0;
  primaryInner.push({
    kind: "assets",
    projectRoot: root0,
    depth: primaryEnd > 0 ? primaryNoteDepth + 1 : 0,
    key: `assets:${root0}`,
  });

  sections.push({
    projectRoot: root0,
    sectionKey: root0,
    mountNote: null,
    depthTrim: primaryNoteDepth,
    innerRows: primaryInner,
  });

  let i = primaryEnd;
  while (i < visibleNotes.length) {
    const row = visibleNotes[i]!;
    if (!isMountId(row.id)) {
      const primary = sections[0]!;
      const inner = primary.innerRows;
      const ins =
        inner.length > 0 && inner[inner.length - 1]!.kind === "assets"
          ? inner.length - 1
          : inner.length;
      inner.splice(ins, 0, { kind: "note", note: row });
      i++;
      continue;
    }
    const mountNote = row;
    const d0 = mountNote.depth;
    i++;
    const childNotes: NoteListItem[] = [];
    while (i < visibleNotes.length && visibleNotes[i]!.depth > d0) {
      childNotes.push(visibleNotes[i]!);
      i++;
    }
    const slot = mountSlot(mountNote.id);
    const pr = workspaceRoots[slot];
    if (!pr) {
      continue;
    }
    const innerRows: SidebarRow[] = [];
    for (const n of childNotes) {
      innerRows.push({ kind: "note", note: n });
    }
    innerRows.push({
      kind: "assets",
      projectRoot: pr,
      depth: d0 + 1,
      key: `assets:${pr}:${slot}`,
    });
    sections.push({
      projectRoot: pr,
      sectionKey: pr,
      mountNote,
      depthTrim: d0 + 1,
      innerRows,
    });
  }

  return sections;
}
