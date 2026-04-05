import { autocompletion, completionKeymap, type Completion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, foldGutter, indentOnInput } from "@codemirror/language";
import { type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";

function nodexBridgeCompletions(): Completion[] {
  if (typeof window === "undefined") return [];
  const nx = (window as unknown as { Nodex?: Record<string, unknown> }).Nodex;
  if (!nx) return [];
  return Object.keys(nx).map((k) => ({
    label: `nodex.${k}`,
    type: (typeof nx[k] === "function" ? "function" : "variable") as "function" | "variable",
    detail: "window.Nodex",
  }));
}

/**
 * Dotted paths under `nodex.shell` / `nodex.devtools` (plain objects + function leaves),
 * kept in sync with `buildNodexShellApi` at runtime.
 */
function collectNestedNodexCompletions(
  value: object,
  basePath: string,
  detail: string,
  remainingDepth: number,
  out: Completion[],
): void {
  if (remainingDepth <= 0) return;
  for (const key of Object.keys(value)) {
    const path = `${basePath}.${key}`;
    const child = (value as Record<string, unknown>)[key];
    if (typeof child === "function") {
      out.push({ label: path, type: "function", detail });
    } else if (child != null && typeof child === "object") {
      out.push({ label: path, type: "variable", detail });
      collectNestedNodexCompletions(child as object, path, detail, remainingDepth - 1, out);
    }
  }
}

/** `window.nodex` top-level keys and nested `nodex.shell.*` / `nodex.devtools.*` (DevTools shell API). */
function nodexWindowCompletions(): Completion[] {
  if (typeof window === "undefined") return [];
  const wn = (window as unknown as { nodex?: Record<string, unknown> }).nodex;
  if (!wn) return [];
  const out: Completion[] = [];
  for (const k of Object.keys(wn)) {
    const v = wn[k];
    out.push({
      label: `nodex.${k}`,
      type: (typeof v === "function" ? "function" : "variable") as "function" | "variable",
      detail: "window.nodex",
    });
    if ((k === "shell" || k === "devtools") && v && typeof v === "object") {
      const detailRoot = k === "shell" ? "window.nodex.shell" : "window.nodex.devtools";
      collectNestedNodexCompletions(v as object, `nodex.${k}`, detailRoot, 2, out);
    }
  }
  return out;
}

const STATIC_COMPLETIONS: Completion[] = [
  { label: "nodex", type: "namespace", detail: "window.Nodex + window.nodex + helpers" },
  { label: "nodex.shell", type: "variable", detail: "window.nodex.shell" },
  { label: "nodex.devtools", type: "variable", detail: "Alias of nodex.shell when mounted" },
  { label: "nodex.commands.run", type: "function", detail: "Run command id" },
  { label: "nodex.openNote", type: "function" },
  { label: "nodex.openPalette", type: "function" },
  { label: "nodex.openMiniBar", type: "function" },
  { label: "nodex.openObservableScratch", type: "function" },
  { label: "Plot", type: "variable", detail: "Observable stdlib" },
  { label: "d3", type: "variable" },
  { label: "Inputs", type: "variable" },
  { label: "md", type: "variable" },
  { label: "html", type: "variable" },
  { label: "svg", type: "variable" },
  { label: "require", type: "function" },
];

function notebookCompletionSource(cellNames: string[]) {
  const nameOpts: Completion[] = cellNames.map((n) => ({
    label: n,
    type: "variable" as const,
    detail: "Cell",
  }));
    const all = [
      ...STATIC_COMPLETIONS,
      ...nodexBridgeCompletions(),
      ...nodexWindowCompletions(),
      ...nameOpts,
    ];

  return (context: CompletionContext) => {
    const before = context.matchBefore(/[\w.]*$/);
    if (!before && !context.explicit) return null;
    const from = before ? before.from : context.pos;
    const q = (before?.text ?? "").toLowerCase();
    // `[\w.]*$` matches "" after `;`, `)`, etc.; empty q + activateOnTyping would list everything.
    if (!context.explicit && q.length === 0) return null;
    const options = all.filter(
      (o) =>
        context.explicit ||
        q.length === 0 ||
        o.label.toLowerCase().startsWith(q) ||
        o.label.toLowerCase().includes(q),
    );
    if (options.length === 0) return null;
    return { from, options };
  };
}

function notebookTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        fontSize: "11px",
        backgroundColor: dark ? "rgb(15 23 42 / 0.5)" : "rgb(255 255 255 / 0.6)",
        color: dark ? "rgb(226 232 240)" : "rgb(15 23 42)",
      },
      ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        minHeight: "104px",
        caretColor: dark ? "rgb(226 232 240)" : "rgb(15 23 42)",
      },
      ".cm-gutters": {
        backgroundColor: dark ? "rgb(15 23 42 / 0.85)" : "rgb(248 250 252)",
        color: dark ? "rgb(148 163 184)" : "rgb(100 116 139)",
        border: "none",
        borderRight: `1px solid ${dark ? "rgb(51 65 85)" : "rgb(226 232 240)"}`,
      },
      ".cm-activeLineGutter": {
        backgroundColor: dark ? "rgb(30 41 59)" : "rgb(241 245 249)",
      },
      ".cm-activeLine": {
        backgroundColor: dark ? "rgb(30 41 59 / 0.35)" : "rgb(241 245 249 / 0.8)",
      },
      ".cm-focused": {
        outline: `1px solid ${dark ? "rgb(71 85 105)" : "rgb(203 213 225)"}`,
        outlineOffset: "-1px",
        borderRadius: "6px",
      },
      ".cm-selectionBackground": {
        backgroundColor: dark ? "rgb(59 130 246 / 0.35)" : "rgb(59 130 246 / 0.2)",
      },
    },
    { dark },
  );
}

/**
 * CodeMirror extensions for Observable notebook JS cells (completions, theme, Mod-Enter).
 */
export function notebookEditorExtensions(opts: {
  cellNames: string[];
  dark: boolean;
  onModEnter?: () => void;
}): Extension[] {
  const runExt: Extension[] = [];
  if (opts.onModEnter) {
    const run = opts.onModEnter;
    runExt.push(
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              run();
              return true;
            },
          },
        ]),
      ),
    );
  }

  return [
    notebookTheme(opts.dark),
    history(),
    indentOnInput(),
    bracketMatching(),
    foldGutter(),
    lineNumbers(),
    javascript({ jsx: false, typescript: false }),
    autocompletion({
      override: [notebookCompletionSource(opts.cellNames)],
      maxRenderedOptions: 40,
    }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
    EditorView.lineWrapping,
    ...runExt,
  ];
}
