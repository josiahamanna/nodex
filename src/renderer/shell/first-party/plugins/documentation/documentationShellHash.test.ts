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

test("hashDocumentationPathFromState round-trips bundled note with heading slug", () => {
  const st = {
    view: "bundled" as const,
    noteId: "nodex-bundled-plugin-complete-guide",
    headingSlug: "3-packaged-plugins-zip-marketplace",
  };
  const path = hashDocumentationPathFromState(st);
  assert.equal(path, "/n/nodex-bundled-plugin-complete-guide/3-packaged-plugins-zip-marketplace");
  const segs = path.split("/").filter(Boolean);
  const parsed = documentationStateFromPathSegments(segs);
  assert.deepEqual(parsed, st);
});

/** Matches `hashForActiveTab` for documentation tabs (see shellTabUrlSync); kept here to avoid importing that module in node:test (ESM path resolution). */
test("documentation tab shell hash prefixes bundled deep link with instance id", () => {
  const instanceId = "plugin.documentation.tab:1775282179238:d01c6b6af71c18";
  const st = {
    view: "bundled" as const,
    noteId: "nodex-bundled-plugin-complete-guide",
    headingSlug: "3-packaged-plugins-zip-marketplace",
  };
  const tail = hashDocumentationPathFromState(st);
  assert.equal(
    `#/t/${instanceId}${tail}`,
    "#/t/plugin.documentation.tab:1775282179238:d01c6b6af71c18/n/nodex-bundled-plugin-complete-guide/3-packaged-plugins-zip-marketplace",
  );
});
