import type { ShellTabInstance, ShellTabsRegistry } from "../../../registries/ShellTabsRegistry";

export const DOCUMENTATION_SHELL_TAB_TYPE_ID = "plugin.documentation.tab";

/** Persisted on the docs shell tab (`state.documentation`) and encoded after `#/t/<instance>/…`. */
export type DocumentationShellTabState = {
  view: "hub" | "command" | "bundled";
  commandId?: string;
  noteId?: string;
  headingSlug?: string;
};

/** Matches heading `id`s from {@link MarkdownRenderer} / `baseSlug` (lowercase). */
const SLUG_RE = /^[a-z0-9-]+$/;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Path after tab instance: `h`, `h/<slug>`, `c/<commandId>`, `c/<commandId>/<slug>`,
 * `n/<noteId>`, `n/<noteId>/<slug>` (note id segment is URI-encoded).
 */
export function documentationStateFromPathSegments(segments: string[]): DocumentationShellTabState | null {
  if (segments.length === 0) return null;
  const [a, b, c] = segments;
  if (a === "h") {
    if (!b || !SLUG_RE.test(b)) return null;
    return { view: "hub", headingSlug: b };
  }
  if (a === "c" && b) {
    const commandId = safeDecode(b);
    if (!commandId) return null;
    if (c) {
      if (!SLUG_RE.test(c)) return null;
      return { view: "command", commandId, headingSlug: c };
    }
    return { view: "command", commandId };
  }
  if (a === "n" && b) {
    const noteId = safeDecode(b);
    if (!noteId) return null;
    if (c) {
      if (!SLUG_RE.test(c)) return null;
      return { view: "bundled", noteId, headingSlug: c };
    }
    return { view: "bundled", noteId };
  }
  return null;
}

export function hashDocumentationPathFromState(doc: DocumentationShellTabState | null | undefined): string {
  if (!doc) return "";
  if (doc.view === "hub") {
    if (doc.headingSlug && SLUG_RE.test(doc.headingSlug)) return `/h/${doc.headingSlug}`;
    return "";
  }
  if (doc.view === "command" && doc.commandId) {
    const enc = encodeURIComponent(doc.commandId);
    if (doc.headingSlug && SLUG_RE.test(doc.headingSlug)) return `/c/${enc}/${doc.headingSlug}`;
    return `/c/${enc}`;
  }
  if (doc.view === "bundled" && doc.noteId) {
    const enc = encodeURIComponent(doc.noteId);
    if (doc.headingSlug && SLUG_RE.test(doc.headingSlug)) return `/n/${enc}/${doc.headingSlug}`;
    return `/n/${enc}`;
  }
  return "";
}

export function readDocumentationStateFromTab(tab: ShellTabInstance | null): DocumentationShellTabState | null {
  if (!tab || tab.tabTypeId !== DOCUMENTATION_SHELL_TAB_TYPE_ID) return null;
  const d = (tab.state as { documentation?: DocumentationShellTabState } | undefined)?.documentation;
  return d ?? null;
}

function docStateEqual(a: DocumentationShellTabState | null, b: DocumentationShellTabState | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.view === b.view &&
    a.commandId === b.commandId &&
    a.noteId === b.noteId &&
    a.headingSlug === b.headingSlug
  );
}

/** `null` = default hub overview with no URL suffix (omit `state.documentation`). */
export function buildDocumentationStateFromUi(
  commandId: string | null,
  bundledNoteId: string | null,
  headingSlug?: string | null,
): DocumentationShellTabState | null {
  if (commandId) {
    return { view: "command", commandId, headingSlug: headingSlug ?? undefined };
  }
  if (bundledNoteId) {
    return { view: "bundled", noteId: bundledNoteId, headingSlug: headingSlug ?? undefined };
  }
  if (headingSlug) {
    return { view: "hub", headingSlug };
  }
  return null;
}

/**
 * Merge or clear `state.documentation` on the docs tab. Empty `pathSegments` removes documentation from state.
 */
export function applyDocumentationDeepLinkToTab(
  tabs: ShellTabsRegistry,
  instanceId: string,
  pathSegments: string[],
): void {
  const inst = tabs.listOpenTabs().find((t) => t.instanceId === instanceId);
  if (!inst || inst.tabTypeId !== DOCUMENTATION_SHELL_TAB_TYPE_ID) return;
  const prev = { ...((inst.state ?? {}) as Record<string, unknown>) };
  if (pathSegments.length === 0) {
    delete prev.documentation;
  } else if (pathSegments.length === 1 && pathSegments[0] === "h") {
    delete prev.documentation;
  } else {
    const doc = documentationStateFromPathSegments(pathSegments);
    if (!doc) return;
    prev.documentation = doc;
  }
  tabs.updateTabPresentation(instanceId, { state: prev });
}

export function mergeDocumentationIntoTabState(
  tabs: ShellTabsRegistry,
  instanceId: string,
  next: DocumentationShellTabState | null,
): void {
  const inst = tabs.listOpenTabs().find((t) => t.instanceId === instanceId);
  if (!inst || inst.tabTypeId !== DOCUMENTATION_SHELL_TAB_TYPE_ID) return;
  const prev = (inst.state ?? {}) as Record<string, unknown>;
  const cur = readDocumentationStateFromTab(inst);
  if (docStateEqual(cur, next)) return;
  const merged = { ...prev };
  if (next) merged.documentation = next;
  else delete merged.documentation;
  tabs.updateTabPresentation(instanceId, { state: merged });
}
