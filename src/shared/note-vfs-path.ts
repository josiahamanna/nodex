import type { WpnNoteWithContextListItem } from "./wpn-v2-types";

/** Single path segment: no raw `/` (replaced) so joined paths stay unambiguous. */
export function normalizeVfsSegment(raw: string, fallback: string): string {
  const t = raw.trim();
  const base = t.length > 0 ? t : fallback;
  return base.replace(/\//g, "\u2215");
}

/** Canonical `Workspace/Project/Title` matching explorer link rows. */
export function canonicalVfsPathFromNoteContext(n: WpnNoteWithContextListItem): string {
  const ws = normalizeVfsSegment(n.workspace_name, "Workspace");
  const proj = normalizeVfsSegment(n.project_name, "Project");
  const title = normalizeVfsSegment(n.title, "Untitled");
  return `${ws}/${proj}/${title}`;
}

export function canonicalVfsPathFromLinkRow(row: {
  workspaceName: string;
  projectName: string;
  title: string;
}): string {
  const ws = normalizeVfsSegment(row.workspaceName, "Workspace");
  const proj = normalizeVfsSegment(row.projectName, "Project");
  const title = normalizeVfsSegment(row.title, "Untitled");
  return `${ws}/${proj}/${title}`;
}

export function resolveNoteIdByCanonicalVfsPath(
  notes: readonly WpnNoteWithContextListItem[],
  canonicalPath: string,
): string | null {
  const target = canonicalPath.trim();
  if (!target) return null;
  for (const n of notes) {
    if (canonicalVfsPathFromNoteContext(n) === target) return n.id;
  }
  return null;
}

/** `#/w/<segment>/<segment>/...` optional trailing heading slug (same rules as note id hashes). */
export function markdownVfsNoteHref(canonicalPath: string, markdownHeadingSlug?: string): string {
  const parts = canonicalPath.split("/").filter((p) => p.length > 0);
  const enc = parts.map((p) => encodeURIComponent(p)).join("/");
  return markdownHeadingSlug && /^[a-z0-9-]+$/i.test(markdownHeadingSlug)
    ? `#/w/${enc}/${markdownHeadingSlug}`
    : `#/w/${enc}`;
}

export type ParsedVfsNoteHash = {
  vfsPath: string;
  markdownHeadingSlug?: string;
};

export function parseVfsNoteHashPath(pathAfterW: string): ParsedVfsNoteHash | null {
  const parts = pathAfterW
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1]!;
  if (parts.length >= 2 && /^[a-z0-9-]+$/i.test(last)) {
    return { vfsPath: parts.slice(0, -1).join("/"), markdownHeadingSlug: last };
  }
  return { vfsPath: parts.join("/") };
}
