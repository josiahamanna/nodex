// Markdown Note Plugin — hybrid: main (Node) + ui.jsx (iframe, React via Nodex bridge)

function activate(context, api) {
  if (typeof api.getUiBootstrap !== "function") {
    throw new Error(
      "[markdown-note] Manifest must declare ui (hybrid plugin) for this loader.",
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
  console.log("[Plugin: markdown-note] Activated (hybrid + bridge)");
}

function deactivate() {
  console.log("[Plugin: markdown-note] Deactivated");
}

module.exports = { activate, deactivate };
