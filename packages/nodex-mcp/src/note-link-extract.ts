const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

function parseNoteIdFromHref(href: string): string | null {
  const raw = href.trim();
  if (!raw) return null;
  let path = raw;
  const hashIdx = path.indexOf("#");
  if (hashIdx >= 0) path = path.slice(hashIdx + 1);
  path = path.replace(/^\/+/, "");
  if (!path.startsWith("n/")) return null;
  const rest = path.slice("n/".length);
  const parts = rest
    .split("/")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const noteId = parts[0];
  return noteId ? noteId : null;
}

export function extractReferencedNoteIdsFromMarkdown(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  MARKDOWN_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKDOWN_LINK_RE.exec(text)) !== null) {
    const href = (m[2] ?? "").trim();
    const id = parseNoteIdFromHref(href);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
