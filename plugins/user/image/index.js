function activate(context, api) {
  if (typeof api.getUiBootstrap !== "function") {
    throw new Error("[image] Hybrid plugin requires manifest ui.");
  }
  const disposable = api.registerNoteRenderer("image", {
    render: async (note) => {
      const ui = await api.getUiBootstrap();
      return `window.__NODEX_NOTE__ = ${JSON.stringify(note)};${ui}`;
    },
  });
  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
