const baseRules = require("./webpack.rules");

// Filter out asset-relocator-loader for renderer process
// It injects __dirname which doesn't exist in browser context
const rules = baseRules.filter((rule) => {
  const loaderName = rule.use?.loader || "";
  return !loaderName.includes("asset-relocator");
});

rules.push({
  test: /\.css$/,
  use: [
    { loader: "style-loader" },
    { loader: "css-loader" },
    { loader: "postcss-loader" },
  ],
});

rules.push({
  test: /\.ttf$/,
  type: "asset/resource",
});

module.exports = {
  module: {
    rules,
  },
  resolve: {
    extensions: [".js", ".ts", ".jsx", ".tsx", ".css"],
  },
  devServer: {
    port: 3001,
    client: {
      overlay: false,
    },
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
