import { useEffect } from "react";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";

export const OBSERVABLE_NOTEBOOK_PLUGIN_ID = "plugin.observable-notebook";

const VIEW_PRIMARY = "plugin.observable-notebook.primary";
const TAB_NOTEBOOK = "plugin.observable-notebook.tab";

function observableNotebookHtml(): string {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        body { margin:0; font-family: ui-sans-serif, system-ui; }
        .bar { display:flex; gap:8px; align-items:center; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,.08); }
        .title { font-weight:700; font-size:12px; opacity:.85; }
        .btn { font-size:12px; padding:6px 10px; border:1px solid rgba(0,0,0,.15); background: rgba(0,0,0,.02); cursor:pointer; }
        .grid { display:grid; grid-template-columns: 1fr 1fr; height: calc(100vh - 48px); }
        .left { overflow:auto; padding:12px; border-right:1px solid rgba(0,0,0,.08); }
        .right { overflow:auto; padding:12px; }
        .cell { border:1px solid rgba(0,0,0,.12); border-radius:8px; padding:10px; margin-bottom:10px; }
        .row { display:flex; gap:8px; align-items:center; margin-bottom:8px; }
        input { font-family: ui-monospace, Menlo, monospace; font-size:11px; padding:6px 8px; border:1px solid rgba(0,0,0,.15); border-radius:6px; width: 160px; }
        textarea { width:100%; height: 110px; resize:none; font-family: ui-monospace, Menlo, monospace; font-size:11px; padding:8px; border:1px solid rgba(0,0,0,.15); border-radius:6px; outline:none; }
        .hint { font-size:11px; opacity:.7; margin-bottom:10px; line-height:1.45; }
        .err { padding:10px 12px; background: rgba(255,0,0,.06); border-bottom:1px solid rgba(255,0,0,.15); font-size:11px; color:#a00; }
        .out { border:1px solid rgba(0,0,0,.08); border-radius:8px; padding:10px; margin-bottom:10px; }
        .out .h { font-family: ui-monospace, Menlo, monospace; font-size:11px; opacity:.7; margin-bottom:6px; }
      </style>
    </head>
    <body>
      <div class="bar">
        <div class="title">Observable notebook</div>
        <button class="btn" id="run">Run</button>
        <button class="btn" id="add">Add cell</button>
        <button class="btn" id="reset">Reset</button>
        <div style="margin-left:auto;font-size:11px;opacity:.65">localStorage</div>
      </div>
      <div id="err" class="err" style="display:none"></div>
      <div class="grid">
        <div class="left">
          <div class="hint">Cells are simple JS expressions, wired through <code>@observablehq/runtime</code>. Dependencies are comma-separated.</div>
          <div id="cells"></div>
        </div>
        <div class="right">
          <div id="out"></div>
        </div>
      </div>
      <script>
        const LS_KEY = 'nodex.observableNotebook.cells.v1';
        const makeId = () => Math.random().toString(16).slice(2) + '-' + Date.now().toString(16);
        const safeParse = (raw, fb) => { try { return raw ? JSON.parse(raw) : fb; } catch { return fb; } };
        const defaults = () => ([
          { id: makeId(), name: 'x', inputs: [], body: '42' },
          { id: makeId(), name: 'y', inputs: ['x'], body: 'x + 1' },
          { id: makeId(), name: 'view', inputs: ['y'], body: \"'y = ' + y\" },
        ]);
        let cells = safeParse(localStorage.getItem(LS_KEY), []);
        if (!Array.isArray(cells) || cells.length === 0) cells = defaults();

        const $cells = document.getElementById('cells');
        const $out = document.getElementById('out');
        const $err = document.getElementById('err');
        const showErr = (m) => { $err.style.display = m ? 'block' : 'none'; $err.textContent = m ? ('Error: ' + m) : ''; };

        const persist = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(cells)); } catch {} };
        const render = () => {
          $cells.innerHTML = '';
          cells.forEach((c) => {
            const el = document.createElement('div');
            el.className = 'cell';
            el.innerHTML = \`
              <div class="row">
                <input data-k="name" placeholder="name" value="\${c.name || ''}"/>
                <input data-k="inputs" style="width: 220px" placeholder="inputs: a,b" value="\${(c.inputs||[]).join(', ')}"/>
                <button class="btn" data-act="del">Del</button>
              </div>
              <textarea data-k="body" spellcheck="false">\${c.body || ''}</textarea>\`;
            el.addEventListener('input', (e) => {
              const t = e.target;
              if (!t || !t.getAttribute) return;
              const k = t.getAttribute('data-k');
              if (!k) return;
              if (k === 'name') c.name = t.value;
              if (k === 'inputs') c.inputs = t.value.split(',').map(s => s.trim()).filter(Boolean);
              if (k === 'body') c.body = t.value;
              persist();
            });
            el.addEventListener('click', (e) => {
              const t = e.target;
              if (!t || !t.getAttribute) return;
              const act = t.getAttribute('data-act');
              if (act === 'del') {
                cells = cells.filter(x => x.id !== c.id);
                persist();
                render();
              }
            });
            $cells.appendChild(el);
          });
        };

        const run = async () => {
          showErr(null);
          $out.innerHTML = '';
          try {
            const api = window.parent && window.parent.nodex && window.parent.nodex.system && window.parent.nodex.system.observable;
            if (!api || !api.Runtime || !api.Inspector) throw new Error('Host did not expose nodex.system.observable (Runtime/Inspector).');
            const Runtime = api.Runtime;
            const Inspector = api.Inspector;

            const runtime = new Runtime();
            const mod = runtime.module();
            const ensureOut = (name) => {
              const block = document.createElement('div');
              block.className = 'out';
              block.innerHTML = '<div class="h">' + String(name) + '</div><div class="slot"></div>';
              $out.appendChild(block);
              return block.querySelector('.slot');
            };

            const seen = new Set();
            const normCells = cells.map((c) => ({
              name: String(c.name || '').trim(),
              inputs: (c.inputs || []).map(x => String(x||'').trim()).filter(Boolean),
              body: String(c.body || '').trim(),
            })).filter(c => c.name).map((c) => {
              let n = c.name;
              while (seen.has(n)) n = n + '_';
              seen.add(n);
              return { ...c, name: n };
            });

            for (const c of normCells) {
              const slot = ensureOut(c.name);
              const observer = Inspector.into(slot);
              const fn = new Function(...c.inputs, '"use strict"; return (async () => { return (' + c.body + '); })();');
              mod.variable(observer(c.name)).define(c.name, c.inputs, (...args) => fn(...args));
            }
          } catch (e) {
            showErr(e && e.message ? e.message : String(e));
          }
        };

        document.getElementById('run').addEventListener('click', () => run());
        document.getElementById('add').addEventListener('click', () => { cells.push({ id: makeId(), name: 'cell' + (cells.length + 1), inputs: [], body: '0' }); persist(); render(); });
        document.getElementById('reset').addEventListener('click', () => { cells = defaults(); persist(); render(); });

        render();
        run();
      </script>
    </body>
  </html>`;
}

export function useRegisterObservableNotebookPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: VIEW_PRIMARY,
        title: "Observable Notebook",
        defaultRegion: "mainArea",
        iframeHtml: observableNotebookHtml(),
        // allow-same-origin so the iframe can access the system-exposed Runtime/Inspector on parent.
        sandboxFlags: "allow-scripts allow-same-origin",
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: TAB_NOTEBOOK,
        title: "Observable",
        order: 9,
        viewId: VIEW_PRIMARY,
      }),
    );

    disposers.push(
      regs.menuRail.registerItem({
        id: "plugin.observable-notebook.rail",
        title: "Observable",
        icon: "O",
        order: 9,
        commandId: "nodex.observableNotebook.open",
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.observableNotebook.open",
        title: "Observable: Open notebook",
        category: "Notebook",
        sourcePluginId: OBSERVABLE_NOTEBOOK_PLUGIN_ID,
        doc: "Open the Observable notebook tab in the primary area.",
        handler: () => {
          regs.tabs.openTab(TAB_NOTEBOOK, "Observable");
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, regs, views]);
}

