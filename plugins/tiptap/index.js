function activate(context, api) {
  if (typeof api.getUiBootstrap !== "function") {
    throw new Error(
      "[tiptap] Manifest must declare ui (hybrid plugin) for this loader.",
    );
  }

  const disposable = api.registerNoteRenderer("text", {
    render: (note) => {
      const ui = api.getUiBootstrap();
      return `
        window.__NODEX_NOTE__ = ${JSON.stringify(note)};
        ${ui}
      `;
    },
  });

  context.subscriptions.push(disposable);
  console.log("[Plugin: tiptap] Activated");
}

function deactivate() {
  console.log("[Plugin: tiptap] Deactivated");
}

module.exports = { activate, deactivate };
