function activate(context, api) {
  if (typeof api.getUiBootstrap !== "function") {
    throw new Error("[audio] Hybrid plugin requires manifest ui.");
  }
  const disposable = api.registerNoteRenderer("audio", {
    render: async (note) => {
      const ui = await api.getUiBootstrap();
      return `window.__NODEX_NOTE__ = ${JSON.stringify(note)};${ui}`;
    },
  });
  context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = { activate, deactivate };
