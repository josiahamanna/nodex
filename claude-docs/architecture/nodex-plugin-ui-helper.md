# Nodex plugin UI state (iframe helpers)

Plugins run in a sandboxed iframe. The host injects:

- `window.Nodex.postMessage(data)` — legacy `action` channel (logged on host).
- `window.Nodex.postPluginUiState(state)` — **versioned snapshot** persisted under `note.metadata.pluginUiState` (debounced ~400ms on host).

Protocol constants and validation: [src/shared/plugin-state-protocol.ts](../../src/shared/plugin-state-protocol.ts).

## Receiving host messages

Set `window.Nodex.onMessage` to handle:

| `message.type` | Meaning |
|----------------|---------|
| `render` | Initial note; `payload` is the full note (includes `metadata.pluginUiState` if any). |
| `update` | Note changed (e.g. title); same payload shape. |
| `hydrate_plugin_ui` | Explicit UI restore; `payload` is `{ v: number, state: unknown }`. |

You may hydrate from either `render`/`update` payload or `hydrate_plugin_ui` (host sends both when persisted state exists).

## Vanilla JS example

```javascript
window.Nodex.onMessage = function (msg) {
  if (msg.type === "hydrate_plugin_ui" && msg.payload) {
    applyState(msg.payload.state);
    return;
  }
  if (msg.type === "render" || msg.type === "update") {
    var note = msg.payload;
    if (note && note.metadata && note.metadata.pluginUiState !== undefined) {
      applyState(note.metadata.pluginUiState);
    }
    renderNote(note);
  }
};

function saveUi() {
  if (window.Nodex.postPluginUiState) {
    window.Nodex.postPluginUiState(getStateObject());
  }
}
```

## Optional Redux (recommended, not mandatory)

Subscribe the store and push debounced snapshots from the plugin side if you want fine-grained control:

```javascript
var t = null;
store.subscribe(function () {
  if (t) clearTimeout(t);
  t = setTimeout(function () {
    t = null;
    if (window.Nodex.postPluginUiState) {
      window.Nodex.postPluginUiState(store.getState());
    }
  }, 300);
});
```

The host **also** debounces IPC (~400ms), so sub-300ms plugin debouncing reduces traffic.

## Manifest / policy (future)

Requiring “Redux only” for plugins would be a **manifest flag** (e.g. `stateManagement: "redux"`) plus IDE or loader checks—not enforced in v1.

## Host-side debugging

- Redux: `pluginUi.byNoteId` in the renderer store ([pluginUiSlice.ts](../../src/renderer/store/pluginUiSlice.ts)).
- Hook: [usePluginNoteState.ts](../../src/renderer/hooks/usePluginNoteState.ts).
