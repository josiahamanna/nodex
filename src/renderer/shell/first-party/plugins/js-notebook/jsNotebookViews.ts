export const JS_NOTEBOOK_PLUGIN_ID = "plugin.js-notebook";

function shellRpcScript(): string {
  // Minimal RPC helper for sandboxed iframes.
  return `
  const nodex = (() => {
    let _ctx = { primary: null };
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (d && d.type === 'nodex.shell.context') _ctx = d.context;
    });
    const call = (method, params) => new Promise((resolve, reject) => {
      const id = Math.random().toString(16).slice(2) + ':' + Date.now();
      const onMsg = (e) => {
        const d = e.data;
        if (!d || d.type !== 'nodex.shell.rpc.result' || d.id !== id) return;
        window.removeEventListener('message', onMsg);
        if (d.ok) resolve(d.value);
        else reject(new Error(d.error || 'RPC error'));
      };
      window.addEventListener('message', onMsg);
      window.parent.postMessage({ type: 'nodex.shell.rpc', id, method, params }, '*');
      setTimeout(() => {
        window.removeEventListener('message', onMsg);
        reject(new Error('RPC timeout'));
      }, 8000);
    });
    return {
      context: { get: () => _ctx },
      commands: { invoke: (commandId, args) => call('commands.invoke', { commandId, args }) },
    };
  })();
  window.nodex = window.nodex || {};
  window.nodex.shell = nodex;
  `;
}

export function jsNotebookPrimaryHtml(): string {
  const script = shellRpcScript();
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; background: #fff; }
        .bar { display:flex; gap:8px; align-items:center; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,.08); }
        .title { font-weight:700; font-size:12px; opacity:.8; }
        .btn { font-size:12px; padding:6px 10px; border:1px solid rgba(0,0,0,.15); background: rgba(0,0,0,.02); cursor:pointer; }
        .wrap { padding:12px; display:flex; flex-direction:column; gap:10px; }
        textarea { width: 100%; min-height: 160px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; padding:10px; border:1px solid rgba(0,0,0,.15); outline:none; }
        pre { margin:0; padding:10px; background: rgba(0,0,0,.04); border:1px solid rgba(0,0,0,.10); white-space:pre-wrap; word-break:break-word; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="bar">
        <div class="title">JS Notebook</div>
        <button class="btn" id="run">Run</button>
        <button class="btn" id="openOutput">Open output dock</button>
        <div style="margin-left:auto; font-size:11px; opacity:.65" id="ctx">context: -</div>
      </div>
      <div class="wrap">
        <textarea id="code">// Write JavaScript here\n({ hello: "nodex" })</textarea>
        <pre id="out">Output will appear here.</pre>
      </div>
      <script>
        ${script}
        const out = document.getElementById('out');
        const ta = document.getElementById('code');
        const ctxEl = document.getElementById('ctx');
        const renderCtx = () => {
          const c = window.nodex.shell.context.get();
          ctxEl.textContent = 'context: ' + (c && c.primary ? c.primary.tabTypeId : '-');
        };
        window.addEventListener('message', (e) => {
          const d = e.data;
          if (d && d.type === 'nodex.shell.context') renderCtx();
        });
        renderCtx();
        document.getElementById('run').addEventListener('click', () => {
          try {
            // eslint-disable-next-line no-new-func
            const fn = new Function('return (async () => {\\n' + ta.value + '\\n})()');
            Promise.resolve(fn()).then((v) => {
              out.textContent = String(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
            }).catch((err) => {
              out.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
            });
          } catch (err) {
            out.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
          }
        });
        document.getElementById('openOutput').addEventListener('click', () => {
          window.nodex.shell.commands.invoke('nodex.jsNotebook.openOutput');
        });
      </script>
    </body>
  </html>`;
}

export function jsNotebookSidebarHtml(): string {
  const script = shellRpcScript();
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; }
        .wrap { padding: 12px; display:flex; flex-direction:column; gap:10px; }
        .h { font-weight:700; font-size:12px; opacity:.8; }
        .p { font-size:12px; opacity:.75; line-height:1.4; }
        .btn { font-size:12px; padding:8px 10px; border:1px solid rgba(0,0,0,.15); background: rgba(0,0,0,.02); cursor:pointer; text-align:left; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="h">Notebook panel</div>
        <div class="p">This is the sidebar panel body contributed by <code>${JS_NOTEBOOK_PLUGIN_ID}</code>.</div>
        <button class="btn" id="openPrimary">Open notebook in primary</button>
        <button class="btn" id="openSecondary">Open notebook in secondary</button>
      </div>
      <script>
        ${script}
        document.getElementById('openPrimary').addEventListener('click', () => {
          window.nodex.shell.commands.invoke('nodex.jsNotebook.openPrimary');
        });
        document.getElementById('openSecondary').addEventListener('click', () => {
          window.nodex.shell.commands.invoke('nodex.jsNotebook.openSecondary');
        });
      </script>
    </body>
  </html>`;
}

export function jsNotebookSecondaryHtml(): string {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; }
        .wrap { padding: 12px; }
        .h { font-weight:700; font-size:12px; opacity:.8; }
        .p { font-size:12px; opacity:.75; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="h">JS Notebook (secondary)</div>
        <div class="p">Secondary area view placeholder.</div>
      </div>
    </body>
  </html>`;
}

export function jsNotebookOutputHtml(): string {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; }
        .wrap { padding: 12px; }
        .h { font-weight:700; font-size:12px; opacity:.8; }
        .p { font-size:12px; opacity:.75; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="h">Notebook output</div>
        <div class="p">This is the bottom-dock output view placeholder.</div>
      </div>
    </body>
  </html>`;
}

