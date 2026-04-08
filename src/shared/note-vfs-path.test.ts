import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalVfsPathFromLinkRow,
  markdownVfsNoteHref,
  parseVfsNoteHashPath,
  resolveNoteIdByCanonicalVfsPath,
  resolveSameProjectRelativeVfsToCanonical,
} from "./note-vfs-path.ts";
import type { WpnNoteWithContextListItem } from "./wpn-v2-types.ts";

test("canonicalVfsPathFromLinkRow joins workspace, project, title", () => {
  assert.equal(
    canonicalVfsPathFromLinkRow({
      workspaceName: "W",
      projectName: "P",
      title: "T",
    }),
    "W/P/T",
  );
});

test("markdownVfsNoteHref and parseVfsNoteHashPath round-trip", () => {
  /** Last segment must not match heading slug pattern `[a-z0-9-]+` or it is parsed as a slug. */
  const path = "Documentation/Hub/My_Page";
  const href = markdownVfsNoteHref(path);
  assert.match(href, /^#\/w\//);
  const tail = href.replace(/^#\/w\//, "");
  const parsed = parseVfsNoteHashPath(tail);
  assert.deepEqual(parsed, { vfsPath: path });
});

test("markdownVfsNoteHref includes heading slug when valid", () => {
  const href = markdownVfsNoteHref("A/B", "my-section");
  assert.equal(href, "#/w/A/B/my-section");
  const parsed = parseVfsNoteHashPath("A/B/my-section");
  assert.deepEqual(parsed, { vfsPath: "A/B", markdownHeadingSlug: "my-section" });
});

test("parseVfsNoteHashPath: same-project relative ./Note (two segments) has no false heading slug", () => {
  const href = markdownVfsNoteHref("./Sibling");
  const tail = href.replace(/^#\/w\//, "");
  assert.deepEqual(parseVfsNoteHashPath(tail), { vfsPath: "./Sibling" });
});

test("parseVfsNoteHashPath: relative with heading slug uses three+ segments", () => {
  const parsed = parseVfsNoteHashPath("./Sibling/my-h2");
  assert.deepEqual(parsed, { vfsPath: "./Sibling", markdownHeadingSlug: "my-h2" });
});

test("resolveSameProjectRelativeVfsToCanonical expands ./Title with base context", () => {
  const base = {
    workspace_name: "W",
    project_name: "P",
  };
  assert.equal(resolveSameProjectRelativeVfsToCanonical("./T", base), "W/P/T");
});

test("resolveNoteIdByCanonicalVfsPath finds first match", () => {
  const notes: WpnNoteWithContextListItem[] = [
    {
      id: "n1",
      title: "One",
      type: "markdown",
      project_id: "p1",
      project_name: "P",
      workspace_id: "w1",
      workspace_name: "W",
    },
  ];
  assert.equal(resolveNoteIdByCanonicalVfsPath(notes, "W/P/One"), "n1");
  assert.equal(resolveNoteIdByCanonicalVfsPath(notes, "W/P/Missing"), null);
});
