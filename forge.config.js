const path = require("path");

module.exports = {
  packagerConfig: {
    asar: true,
    /** Basenames become `Resources/<name>` — see `resolveBundledCorePluginsDir` and `seed-user-plugins`. */
    extraResource: [
      path.resolve(__dirname, "plugins/core"),
      path.resolve(__dirname, "plugins/markdown"),
      path.resolve(__dirname, "plugins/tiptap"),
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
