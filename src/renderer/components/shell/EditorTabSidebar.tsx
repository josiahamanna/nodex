import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  dispatchIdeShellAction,
  dispatchIdeShellOpenFile,
  IDE_SHELL_STATE_EVENT,
  type IdeShellAction,
  type IdeShellStateDetail,
} from "../../plugin-ide/ideShellBridge";

type FileTreeNode = {
  name: string;
  path: string | null;
  children: FileTreeNode[];
};

function buildFileTree(paths: string[]): FileTreeNode[] {
  type Acc = {
    seg: string;
    fullPath: string | null;
    children: Map<string, Acc>;
  };
  const root = new Map<string, Acc>();
  for (const p of paths) {
    const norm = p.replace(/\\/g, "/");
    const parts = norm.split("/").filter(Boolean);
    let level = root;
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      acc = i === 0 ? parts[0]! : `${acc}/${parts[i]!}`;
      const isLeaf = i === parts.length - 1;
      let node = level.get(parts[i]!);
      if (!node) {
        node = {
          seg: parts[i]!,
          fullPath: isLeaf ? norm : null,
          children: new Map(),
        };
        level.set(parts[i]!, node);
      } else if (isLeaf) {
        node.fullPath = norm;
      }
      if (!isLeaf) {
        level = node.children;
      }
    }
  }
  const toArr = (m: Map<string, Acc>): FileTreeNode[] =>
    [...m.values()]
      .sort((a, b) => {
        const aDir = a.children.size > 0 || a.fullPath === null;
        const bDir = b.children.size > 0 || b.fullPath === null;
        if (aDir !== bDir) {
          return aDir ? -1 : 1;
        }
        return a.seg.localeCompare(b.seg);
      })
      .map((n) => ({
        name: n.seg,
        path: n.fullPath,
        children: toArr(n.children),
      }));
  return toArr(root);
}

const menuBtn =
  "min-h-7 rounded-sm border border-input bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted/50";
const menuPanel =
  "absolute left-0 top-full z-50 mt-1 min-w-[12rem] rounded-md border border-border bg-background py-1 shadow-lg";
const menuItem =
  "w-full px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50";

function fireAction(type: IdeShellAction): void {
  dispatchIdeShellAction(type);
}

const EditorTabSidebar: React.FC = () => {
  const [state, setState] = useState<IdeShellStateDetail>({
    pluginFolder: "",
    fileList: [],
    activePath: null,
    busy: false,
    dirtyTabCount: 0,
    hasActiveTab: false,
  });
  const [menu, setMenu] = useState<null | "file" | "edit" | "build">(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tree = useMemo(() => buildFileTree(state.fileList), [state.fileList]);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<IdeShellStateDetail>).detail;
      if (d && typeof d === "object") {
        setState(d);
      }
    };
    window.addEventListener(IDE_SHELL_STATE_EVENT, onState);
    return () => window.removeEventListener(IDE_SHELL_STATE_EVENT, onState);
  }, []);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onDown = (ev: MouseEvent) => {
      const el = wrapRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setMenu(null);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const pf = state.pluginFolder;
  const busy = state.busy;
  const hasOpen = state.hasActiveTab;
  const dirty = state.dirtyTabCount;

  const renderTreeNodes = (nodes: FileTreeNode[], depth: number): React.ReactNode =>
    nodes.map((n) => {
      const isDir = n.children.length > 0 || n.path === null;
      const pad = 8 + depth * 12;
      if (isDir && n.children.length > 0) {
        return (
          <li key={`${depth}-${n.name}`} className="list-none">
            <div
              className="truncate py-[3px] font-mono text-[12px] text-muted-foreground"
              style={{ paddingLeft: pad }}
            >
              {n.name}
            </div>
            <ul className="m-0 p-0">
              {renderTreeNodes(n.children, depth + 1)}
            </ul>
          </li>
        );
      }
      const rel = n.path ?? "";
      const active = state.activePath === rel;
      return (
        <li key={rel || `${depth}-${n.name}`} className="list-none">
          <button
            type="button"
            style={{ paddingLeft: pad }}
            className={`w-full truncate border-l-2 py-[4px] pr-2 text-left font-mono text-[12px] leading-snug transition-colors hover:bg-muted/50 ${
              active
                ? "border-primary bg-muted/50 font-medium text-foreground"
                : "border-transparent text-foreground"
            }`}
            title={rel}
            onClick={() => dispatchIdeShellOpenFile(rel)}
          >
            {n.name}
          </button>
        </li>
      );
    });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={wrapRef}
        className="shrink-0 border-sidebar-border border-b px-1 py-1.5"
      >
        <div className="flex flex-wrap gap-1">
          <div className="relative">
            <button
              type="button"
              className={menuBtn}
              aria-expanded={menu === "file"}
              aria-haspopup="true"
              onClick={() => setMenu((m) => (m === "file" ? null : "file"))}
            >
              File
            </button>
            {menu === "file" ? (
              <div className={menuPanel} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!hasOpen || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("save");
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy || dirty === 0}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("saveAll");
                  }}
                >
                  Save all
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("newFile");
                  }}
                >
                  New file
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("newFolder");
                  }}
                >
                  New folder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("importFiles");
                  }}
                >
                  Import file(s)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("importFolder");
                  }}
                >
                  Import folder
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || !state.activePath || busy}
                  className={`${menuItem} text-red-800 hover:bg-red-50`}
                  onClick={() => {
                    setMenu(null);
                    fireAction("delete");
                  }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || !state.activePath || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("rename");
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || !state.activePath || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("copy");
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("paste");
                  }}
                >
                  Paste
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("copyDist");
                  }}
                >
                  Copy dist…
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              className={menuBtn}
              aria-expanded={menu === "edit"}
              aria-haspopup="true"
              onClick={() => setMenu((m) => (m === "edit" ? null : "edit"))}
            >
              Edit
            </button>
            {menu === "edit" ? (
              <div className={menuPanel} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("typecheck");
                  }}
                >
                  Check types
                </button>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button
              type="button"
              className={menuBtn}
              aria-expanded={menu === "build"}
              aria-haspopup="true"
              onClick={() => setMenu((m) => (m === "build" ? null : "build"))}
            >
              Build
            </button>
            {menu === "build" ? (
              <div className={`${menuPanel} min-w-[13rem]`} role="menu">
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("loadParent");
                  }}
                >
                  Load parent (.nodexplugin)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={`${menuItem} text-amber-900 hover:bg-amber-50`}
                  onClick={() => {
                    setMenu(null);
                    fireAction("removeExternal");
                  }}
                >
                  Remove external
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("bundle");
                  }}
                >
                  Bundle
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("bundleReload");
                  }}
                >
                  Bundle &amp; reload
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("reloadRegistry");
                  }}
                >
                  Reload registry
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!pf || busy}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("installDeps");
                  }}
                >
                  Install dependencies
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-sidebar-border border-b px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Workspace files
          </span>
        </div>
        {!pf ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground">
            Select a plugin in the editor column to load its file tree.
          </p>
        ) : (
          <ul className="m-0 list-none py-1">
            {renderTreeNodes(tree, 0)}
          </ul>
        )}
      </div>
    </div>
  );
};

export default EditorTabSidebar;
