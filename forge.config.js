const path = require("path");

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
    /** Basenames become `Resources/<folderName>` — see `resolveBundledReadonlyPluginRoots` in main-helpers. */
    extraResource: [
      path.resolve(__dirname, "plugins/system"),
      path.resolve(__dirname, "plugins/user"),
    ],
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
      config: {},
    },
    {
      name: "@electron-forge/maker-rpm",
      config: {},
    },
  ],
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
