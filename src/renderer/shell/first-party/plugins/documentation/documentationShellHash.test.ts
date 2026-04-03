import assert from "node:assert/strict";
import test from "node:test";
import {
  documentationStateFromPathSegments,
  hashDocumentationPathFromState,
} from "./documentationShellHash.ts";

test("documentationStateFromPathSegments parses hub heading", () => {
  assert.deepEqual(documentationStateFromPathSegments(["h", "overview"]), {
    view: "hub",
    headingSlug: "overview",
  });
});

test("documentationStateFromPathSegments parses command and optional slug", () => {
  assert.deepEqual(documentationStateFromPathSegments(["c", "nodex.docs.open"]), {
    view: "command",
    commandId: "nodex.docs.open",
  });
  assert.deepEqual(documentationStateFromPathSegments(["c", "nodex.docs.open", "returns"]), {
    view: "command",
    commandId: "nodex.docs.open",
    headingSlug: "returns",
  });
});

test("documentationStateFromPathSegments parses bundled note", () => {
  assert.deepEqual(documentationStateFromPathSegments(["n", "nodex-docs-hub-overview"]), {
    view: "bundled",
    noteId: "nodex-docs-hub-overview",
  });
});

test("hashDocumentationPathFromState round-trips command id with encoding", () => {
  const st = { view: "command" as const, commandId: "a.b", headingSlug: "args" };
  const path = hashDocumentationPathFromState(st);
  assert.equal(path, `/c/${encodeURIComponent("a.b")}/args`);
  const segs = path.split("/").filter(Boolean);
  assert.equal(segs[0], "c");
  const parsed = documentationStateFromPathSegments(segs);
  assert.deepEqual(parsed, st);
});
