// Hybrid plugin: Node main + ui.jsx bundled for the sandboxed iframe.

function activate(context, api) {
  if (typeof api.getUiBootstrap !== "function") {
    throw new Error(
      "[markdown] Manifest must declare ui (hybrid plugin) for this loader.",
    );
  }

  const disposable = api.registerNoteRenderer("markdown", {
    render: (note) => {
      const ui = api.getUiBootstrap();
      return `
        window.__NODEX_NOTE__ = ${JSON.stringify(note)};
        ${ui}
      `;
    },
  });

  context.subscriptions.push(disposable);
  console.log("[Plugin: markdown] Activated");
}

function deactivate() {
  console.log("[Plugin: markdown] Deactivated");
}

module.exports = { activate, deactivate };
