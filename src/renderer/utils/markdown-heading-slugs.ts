/**
 * Shared slug rules for markdown outline (TOC) and rendered heading ids.
 * TOC parses source lines; the preview uses plain text from the React tree — keep slugs aligned when possible.
 */
export function baseSlug(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "section";
}

/** Best-effort strip of common GFM inline syntax from an ATX / setext heading source fragment. */
export function stripInlineMarkdownHeadingSource(raw: string): string {
  let s = raw.trim();
  s = s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  for (let i = 0; i < 4; i += 1) {
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  }
  s = s.replace(/\*([^*]+)\*/g, "$1");
  s = s.replace(/_([^_\s][^_]*[^_\s])_/g, "$1");
  return s.trim();
}
