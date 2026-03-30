const path = require("path");
const fs = require("fs");

/**
 * Dev-server CSP header (Electron Forge webpack plugin default omits media-src / nodex-asset).
 * Without this, that header is AND‑merged with the page meta and blocks nodex-asset in plugin
 * srcdoc (e.g. audio/video in sandboxed notes). Keep script-src compatible with eval source maps.
 */
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' data:",
  "script-src-elem 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: nodex-asset:",
  "media-src 'self' data: blob: nodex-asset:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:* blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' nodex-asset: blob: data: about:",
  "object-src 'self' nodex-asset: blob: data:",
].join("; ");

module.exports = {
  packagerConfig: {
    asar: true,
    /** Shown in menus / .desktop; package id for installers. */
    name: "nodex",
    executableName: "nodex",
    productName: "Nodex",
    /** Basenames become `Resources/<folderName>` — see `resolveBundledReadonlyPluginRoots` in main-helpers. */
    extraResource: [
      path.resolve(__dirname, "plugins/system"),
      path.resolve(__dirname, "plugins/user"),
    ].filter((p) => fs.existsSync(p)),
  },
  rebuildConfig: {},
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {},
    },
    {
      name: "@electron-forge/maker-zip",
      platforms: ["darwin"],
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          name: "nodex",
          productName: "Nodex",
          /** Path to the Electron binary inside the packaged app (defaults to package.json name). */
          bin: "nodex",
          maintainer: "Nodex <nodex@nodex.local>",
          genericName: "Knowledge workspace",
        },
      },
    },
    {
      name: "@forkprince/electron-forge-maker-appimage",
      platforms: ["linux"],
      config: {
        productName: "Nodex",
      },
    },
  ],
  hooks: {
    preMake: async () => {
      // Avoid Forge webpack maker failures ("dest already exists") on repeated makes.
      try {
        fs.rmSync(path.resolve(__dirname, ".webpack"), {
          recursive: true,
          force: true,
        });
      } catch {
        /* ignore */
      }
    },
  },
  plugins: [
    {
      name: "@electron-forge/plugin-webpack",
      config: {
        mainConfig: "./webpack.main.config.js",
        port: 3001,
        loggerPort: 9001,
        devContentSecurityPolicy: DEV_CSP,
        renderer: {
          config: "./webpack.renderer.config.js",
          entryPoints: [
            {
              html: "./src/renderer/index.html",
              js: "./src/renderer/index.tsx",
              name: "main_window",
              preload: {
                js: "./src/preload.ts",
              },
            },
          ],
        },
      },
    },
  ],
};
