#!/usr/bin/env node
/**
 * After packaging, copy Next static export (`apps/nodex-web/out`) next to `app.asar` under `resources/nodex-web/`.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function copyNodexWebUi(buildPath) {
  const webOut = path.join(root, "apps", "nodex-web", "out");
  if (!fs.existsSync(webOut)) {
    console.warn(
      "[forge] apps/nodex-web/out missing — run `npm run build:web:static` before `electron-forge package`",
    );
    return;
  }
  const resourcesDir = path.resolve(buildPath, "..");
  if (!fs.existsSync(resourcesDir)) {
    console.warn("[forge] no resources directory at", resourcesDir);
    return;
  }
  const dest = path.join(resourcesDir, "nodex-web");
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(webOut, dest, { recursive: true });
  console.info("[forge] copied Next static UI to", dest);
}

module.exports = { copyNodexWebUi };
