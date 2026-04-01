#!/usr/bin/env node
/**
 * Next static export for packaged Electron (`out/` → copied to `resources/nodex-web/`).
 */
const { execSync } = require("child_process");
const path = require("path");

process.env.NODEX_NEXT_STATIC_EXPORT = "1";
const webDir = path.join(__dirname, "..", "apps", "nodex-web");
execSync("npx next build", { stdio: "inherit", cwd: webDir, env: process.env });
