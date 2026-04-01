/**
 * better-sqlite3 is native; postinstall uses electron-rebuild (Electron ABI).
 * `npm run start:api` uses system Node — if ABIs differ, dlopen fails.
 * On ERR_DLOPEN_FAILED, rebuild once for the current `node` on PATH.
 */
const { execFileSync, execSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");

try {
  // The .node file is loaded lazily on first `new Database()`, not on `require()`.
  const Database = require("better-sqlite3");
  const probe = new Database(":memory:");
  probe.close();
} catch (e) {
  const dlopen =
    e &&
    (e.code === "ERR_DLOPEN_FAILED" ||
      /was compiled against a different Node\.js version|NODE_MODULE_VERSION/i.test(
        String(e.message || ""),
      ));
  if (dlopen) {
    // eslint-disable-next-line no-console
    console.warn(
      `[nodex] Rebuilding better-sqlite3 for Node ${process.version} (ABI mismatch with existing .node file)…`,
    );
    execSync("npm rebuild better-sqlite3", {
      stdio: "inherit",
      cwd: root,
      env: process.env,
    });
    // Verify in a fresh process — reloading better-sqlite3 in this process can crash (native addon).
    execFileSync(
      process.execPath,
      ["-e", "new (require('better-sqlite3'))(':memory:').close()"],
      { stdio: "inherit", cwd: root, env: process.env },
    );
  } else {
    throw e;
  }
}
