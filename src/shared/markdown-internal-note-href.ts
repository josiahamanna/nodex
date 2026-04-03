export type InternalMarkdownNoteLink = {
  noteId: string;
  /** Single path segment; matches heading `id` in preview (no `/`). */
  markdownHeadingSlug?: string;
};

/**
 * Parses a markdown link `href` that targets another note via shell hash routes.
 * Accepts `#/n/<id>`, `#/n/<id>/<slug>`, `/n/<id>`, `n/<id>`, and absolute URLs whose hash is `#/n/...`.
 */
export function parseInternalMarkdownNoteLink(href: string): InternalMarkdownNoteLink | null {
  const raw = href.trim();
  if (!raw) return null;

  let path = raw;
  const hashIdx = path.indexOf("#");
  if (hashIdx >= 0) {
    path = path.slice(hashIdx + 1);
  }

  path = path.replace(/^\/+/, "");
  if (!path.startsWith("n/")) {
    return null;
  }

  const rest = path.slice("n/".length);
  const parts = rest
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const noteId = parts[0];
  if (!noteId) return null;
  const slug = parts[1];
  if (slug && !/^[a-z0-9-]+$/i.test(slug)) {
    return { noteId };
  }
  return slug ? { noteId, markdownHeadingSlug: slug } : { noteId };
}

export function parseNoteIdFromInternalMarkdownHref(href: string): string | null {
  return parseInternalMarkdownNoteLink(href)?.noteId ?? null;
}

export function markdownInternalNoteHref(noteId: string, markdownHeadingSlug?: string): string {
  return markdownHeadingSlug
    ? `#/n/${noteId}/${markdownHeadingSlug}`
    : `#/n/${noteId}`;
}

/** Markdown `(...)` destinations only; used for backlink indexing. */
export function collectReferencedNoteIdsFromMarkdown(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const href = (m[2] ?? "").trim();
    const id = parseNoteIdFromInternalMarkdownHref(href);
    if (id) out.add(id);
  }
  return out;
}
