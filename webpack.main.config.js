const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  target: "electron-main",
  entry: "./src/main.ts",
  module: {
    rules: require("./webpack.rules"),
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css", ".json"],
  },
  externalsPresets: { node: true },
  externals: {
    "adm-zip": "commonjs adm-zip",
    "./zip-handler": "commonjs ./zip-handler",
    // Rollup 4 loads @rollup/rollup-<platform> native addons; bundling breaks that resolution.
    rollup: "commonjs rollup",
    // esbuild spawns a worker with paths relative to its package root; bundling breaks that.
    esbuild: "commonjs esbuild",
    // Bundling these breaks transitive deps (e.g. is-reference) → "isReference is not a function" at bundle time.
    "@rollup/plugin-commonjs": "commonjs @rollup/plugin-commonjs",
    "@rollup/plugin-node-resolve": "commonjs @rollup/plugin-node-resolve",
    "@rollup/plugin-replace": "commonjs @rollup/plugin-replace",
    "rollup-plugin-esbuild": "commonjs rollup-plugin-esbuild",
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: "src/core/zip-handler.js", to: "zip-handler.js" }],
    }),
  ],
  node: {
    __dirname: true,
    __filename: true,
  },
};
