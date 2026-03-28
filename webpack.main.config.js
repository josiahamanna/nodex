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
