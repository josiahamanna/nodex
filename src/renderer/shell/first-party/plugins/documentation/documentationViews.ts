export const DOCS_PLUGIN_ID = "plugin.documentation";
export const DOCS_BC = "nodex.documentation.sync";

function rpcBootstrapScript(): string {
  return `
  const shell = (() => {
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
      commands: {
        list: () => call('commands.list', null),
        invoke: (commandId, args) => call('commands.invoke', { commandId, args }),
      },
      keymap: { list: () => call('keymap.list', null) },
      devtools: { describe: () => call('devtools.describe', null) },
    };
  })();
  window.nodex = window.nodex || {};
  window.nodex.shell = shell;
  `;
}

/** Sidebar panel: search + command list + details */
export function documentationSearchPanelHtml(): string {
  const script = rpcBootstrapScript();
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; font-size:12px; }
        .head { padding:8px 10px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:700; opacity:.85; }
        .search { width:calc(100% - 20px); margin:8px 10px; box-sizing:border-box; padding:8px 10px; border:1px solid rgba(0,0,0,.15); outline:none; }
        .muted { font-size:11px; opacity:.65; padding:0 10px 6px; }
        .list { display:flex; flex-direction:column; gap:4px; padding:0 8px 10px; max-height:calc(100vh - 220px); overflow:auto; }
        .item { text-align:left; padding:6px 8px; border:1px solid rgba(0,0,0,.10); background: rgba(0,0,0,.01); cursor:pointer; }
        .item:hover { background: rgba(0,0,0,.04); }
        .item .id { font-family: ui-monospace, Menlo, monospace; font-size:10px; }
        .item .t { font-size:11px; opacity:.8; }
        .detail { padding:10px; border-top:1px solid rgba(0,0,0,.08); max-height:40vh; overflow:auto; }
        pre { white-space:pre-wrap; word-break:break-word; margin:0; padding:8px; border:1px solid rgba(0,0,0,.10); background: rgba(0,0,0,.03); font-size:10px; }
        .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:6px; }
        .pill { font-size:9px; padding:2px 5px; border:1px solid rgba(0,0,0,.15); opacity:.75; }
        .btn { font-size:10px; padding:4px 8px; border:1px solid rgba(0,0,0,.15); background: rgba(0,0,0,.02); cursor:pointer; margin-left:10px; }
      </style>
    </head>
    <body>
      <div class="head">Search commands</div>
      <input class="search" id="q" placeholder="Filter by id, title, doc…" />
      <div class="muted"><span id="count">—</span><button type="button" class="btn" id="reload">Reload list</button></div>
      <div class="list" id="list"></div>
      <div class="detail" id="details"><span class="muted">Select a command</span></div>
      <script>
        ${script}
        const BC = ${JSON.stringify(DOCS_BC)};
        const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BC) : null;
        const $q = document.getElementById('q');
        const $list = document.getElementById('list');
        const $count = document.getElementById('count');
        const $details = document.getElementById('details');
        let commands = [];
        let miniOnly = true;
        let selectedId = null;

        const norm = (s) => String(s || '').toLowerCase().trim();
        const label = (c) => (c.category ? (c.category + ': ' + c.title) : c.title);
        const matches = (c, q) => {
          if (!q) return true;
          const h = norm(c.id + ' ' + label(c) + ' ' + (c.doc || '') + ' ' + (c.sourcePluginId || ''));
          return q.split(/\\s+/).filter(Boolean).every((p) => h.includes(p));
        };
        const esc = (s) => String(s || '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

        const renderDetails = (c) => {
          const rows = [
            '<div class="row"><span class="pill">id</span><span style="font-family:monospace;font-size:10px">' + esc(c.id) + '</span></div>',
            '<div class="row"><span class="pill">title</span><span>' + esc(c.title) + '</span></div>',
            (c.category ? '<div class="row"><span class="pill">category</span><span>' + esc(c.category) + '</span></div>' : ''),
            (c.sourcePluginId ? '<div class="row"><span class="pill">plugin</span><span>' + esc(c.sourcePluginId) + '</span></div>' : ''),
            '<div class="muted" style="margin-top:8px">doc</div><pre>' + esc(c.doc || '(no doc)') + '</pre>'
          ].filter(Boolean).join('');
          $details.innerHTML = rows;
        };

        const renderList = () => {
          const q = norm($q.value);
          const filtered = commands
            .filter((c) => !miniOnly || c.miniBar !== false)
            .filter((c) => matches(c, q))
            .sort((a,b) => String(a.id).localeCompare(String(b.id)));
          $count.textContent = filtered.length + ' match(es)';
          $list.innerHTML = '';
          for (const c of filtered.slice(0, 300)) {
            const btn = document.createElement('button');
            btn.className = 'item';
            btn.type = 'button';
            btn.innerHTML = '<div class="id">' + esc(c.id) + '</div><div class="t">' + esc(label(c)) + '</div>';
            btn.addEventListener('click', () => { selectedId = c.id; renderDetails(c); });
            $list.appendChild(btn);
          }
        };

        const load = async () => {
          commands = await window.nodex.shell.commands.list();
          renderList();
          if (selectedId) {
            const c = commands.find((x) => x.id === selectedId);
            if (c) renderDetails(c);
          }
        };

        document.getElementById('reload').addEventListener('click', () => load().catch(() => {}));
        $q.addEventListener('input', () => renderList());
        if (bc) {
          bc.addEventListener('message', (ev) => {
            const d = ev.data || {};
            if (d.type === 'docs.setMiniOnly' && typeof d.miniOnly === 'boolean') {
              miniOnly = d.miniOnly;
              renderList();
            }
            if (d.type === 'docs.refreshCommands') load().catch(() => {});
          });
        }
        load().catch((e) => { $details.textContent = String(e && e.message ? e.message : e); });
      </script>
    </body>
  </html>`;
}

/** Secondary area: filters, keyboard table, about, DevTools API shape */
export function documentationSettingsPanelHtml(): string {
  const script = rpcBootstrapScript();
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; font-size:12px; }
        .head { padding:10px 12px; border-bottom:1px solid rgba(0,0,0,.08); font-weight:800; opacity:.85; }
        .bar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,.06); }
        .chip { font-size:11px; padding:6px 10px; border:1px solid rgba(0,0,0,.15); background: rgba(0,0,0,.02); cursor:pointer; }
        .tabs { display:flex; gap:6px; padding:8px 12px; border-bottom:1px solid rgba(0,0,0,.06); }
        .tab { font-size:11px; padding:5px 10px; border:1px solid rgba(0,0,0,.15); cursor:pointer; background:#fff; }
        .tab[data-a="1"] { background: rgba(0,0,0,.05); }
        .page { display:none; padding:12px; }
        .page[data-a="1"] { display:block; }
        .h { font-size:12px; font-weight:700; margin:0 0 8px; }
        .muted { font-size:11px; opacity:.7; line-height:1.45; }
        table { border-collapse: collapse; width:100%; font-size:11px; }
        th, td { border:1px solid rgba(0,0,0,.12); padding:6px 8px; text-align:left; }
        th { background: rgba(0,0,0,.03); }
        pre { white-space:pre-wrap; font-size:10px; padding:8px; border:1px solid rgba(0,0,0,.1); background: rgba(0,0,0,.02); }
      </style>
    </head>
    <body>
      <div class="head">Documentation — settings</div>
      <div class="bar">
        <button type="button" class="chip" id="toggleMini">Minibuffer-only: on</button>
        <button type="button" class="chip" id="refresh">Refresh all</button>
      </div>
      <div class="tabs">
        <button type="button" class="tab" id="t1" data-a="1">Keyboard</button>
        <button type="button" class="tab" id="t2" data-a="0">API shape</button>
        <button type="button" class="tab" id="t3" data-a="0">About</button>
      </div>
      <div class="page" id="p1" data-a="1">
        <div class="h">Shortcuts (scraped)</div>
        <div class="muted" id="keys">Loading…</div>
      </div>
      <div class="page" id="p2" data-a="0">
        <div class="h">DevTools <code>window.nodex.shell.*</code></div>
        <div id="api" class="muted">Loading…</div>
      </div>
      <div class="page" id="p3" data-a="0">
        <div class="h">About</div>
        <div class="muted">
          <code>${DOCS_PLUGIN_ID}</code> scrapes the shell at runtime (commands, keymap, API introspection).
          Plugins should set <code>sourcePluginId</code> and <code>doc</code> on registered commands.
        </div>
      </div>
      <script>
        ${script}
        const BC = ${JSON.stringify(DOCS_BC)};
        const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BC) : null;
        let miniOnly = true;
        const $toggleMini = document.getElementById('toggleMini');
        const esc = (s) => String(s || '').replace(/[&<>"]/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));

        const setTab = (n) => {
          [['t1','p1'], ['t2','p2'], ['t3','p3']].forEach(([tid, pid], i) => {
            document.getElementById(tid).dataset.a = (i + 1 === n) ? '1' : '0';
            document.getElementById(pid).dataset.a = (i + 1 === n) ? '1' : '0';
          });
        };
        document.getElementById('t1').addEventListener('click', () => setTab(1));
        document.getElementById('t2').addEventListener('click', () => { setTab(2); renderApi(); });
        document.getElementById('t3').addEventListener('click', () => setTab(3));

        const renderKeys = async () => {
          const el = document.getElementById('keys');
          try {
            const keys = await window.nodex.shell.keymap.list();
            const rows = (keys || []).map((k) =>
              '<tr><td style="font-family:monospace">' + esc(k.chord) + '</td><td>' + esc(k.title) + '</td><td style="font-family:monospace">' + esc(k.commandId) + '</td><td>' + esc(k.sourcePluginId || '') + '</td></tr>'
            ).join('');
            el.innerHTML = '<table><thead><tr><th>chord</th><th>action</th><th>command</th><th>plugin</th></tr></thead><tbody>' + rows + '</tbody></table>';
          } catch (e) {
            el.textContent = String(e && e.message ? e.message : e);
          }
        };
        const renderApi = async () => {
          const el = document.getElementById('api');
          try {
            const d = await window.nodex.shell.devtools.describe();
            const blocks = [];
            for (const k of Object.keys(d).sort()) {
              blocks.push('<div class="muted" style="margin:10px 0 6px">' + esc(k) + '</div>');
              const rows = (d[k] || []).map((x) => '<tr><td>' + esc(x.key) + '</td><td>' + esc(x.type) + '</td></tr>').join('');
              blocks.push('<table><thead><tr><th>member</th><th>type</th></tr></thead><tbody>' + rows + '</tbody></table>');
            }
            el.innerHTML = blocks.join('');
          } catch (e) {
            el.textContent = String(e && e.message ? e.message : e);
          }
        };

        $toggleMini.addEventListener('click', () => {
          miniOnly = !miniOnly;
          $toggleMini.textContent = 'Minibuffer-only: ' + (miniOnly ? 'on' : 'off');
          if (bc) bc.postMessage({ type: 'docs.setMiniOnly', miniOnly });
        });
        document.getElementById('refresh').addEventListener('click', () => {
          if (bc) bc.postMessage({ type: 'docs.refreshCommands' });
          renderKeys();
          renderApi();
        });

        renderKeys();
        renderApi();
      </script>
    </body>
  </html>`;
}

/** Main area: single line hub when Docs tab is active */
export function documentationHubHtml(): string {
  return `<!doctype html>
  <html><head><meta charset="utf-8"/><style>
    body { margin:0; font-family: system-ui; padding:20px; font-size:13px; color: #555; }
    code { font-size:12px; }
  </style></head><body>
    <p><strong>Documentation</strong> — search commands in the <strong>left panel</strong>; keyboard shortcuts, API shape, and filters in the <strong>secondary column</strong>.</p>
  </body></html>`;
}
