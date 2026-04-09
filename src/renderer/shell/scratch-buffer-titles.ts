/** Emacs-style next scratch buffer title from existing root titles (flat list). */
export function computeNextScratchBufferTitle(rootTitles: string[]): string {
  const roots = rootTitles.map((t) => t.trim());
  if (!roots.some((t) => t === "Scratch")) {
    return "Scratch";
  }
  let maxSuffix = 0;
  for (const title of roots) {
    const m = title.match(/^Scratch(?:-([0-9]+))?$/);
    if (!m) {
      continue;
    }
    const suffix = m[1] ? Number.parseInt(m[1]!, 10) : 0;
    if (Number.isFinite(suffix)) {
      maxSuffix = Math.max(maxSuffix, suffix);
    }
  }
  return `Scratch-${maxSuffix + 1}`;
}
