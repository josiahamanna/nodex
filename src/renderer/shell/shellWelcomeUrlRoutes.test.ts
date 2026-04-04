import assert from "node:assert/strict";
import test from "node:test";
import { tryParseWelcomeShellHash } from "./shellWelcomeUrlRoutes.ts";

test("tryParseWelcomeShellHash base and segments", () => {
  assert.deepEqual(tryParseWelcomeShellHash("welcome"), { kind: "welcome", segment: "" });
  assert.deepEqual(tryParseWelcomeShellHash("/welcome"), { kind: "welcome", segment: "" });
  assert.deepEqual(tryParseWelcomeShellHash("/welcome/"), { kind: "welcome", segment: "" });
  assert.deepEqual(tryParseWelcomeShellHash("/welcome/documentation"), {
    kind: "welcome",
    segment: "documentation",
  });
  assert.deepEqual(tryParseWelcomeShellHash("welcome/documentation"), {
    kind: "welcome",
    segment: "documentation",
  });
  assert.equal(tryParseWelcomeShellHash("/welcome/unknown-segment"), null);
  assert.equal(tryParseWelcomeShellHash("t/foo"), undefined);
});
