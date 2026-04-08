import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/** Ensures Docker / CI context that copies `docs/bundled-plugin-authoring` stays aligned with this package layout. */
test("bundled documentation sources exist relative to sync-api package", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const bundledDir = path.resolve(here, "../../../docs/bundled-plugin-authoring");
  assert.ok(fs.existsSync(path.join(bundledDir, "manifest.json")), bundledDir);
});
