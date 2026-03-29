import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dispatchIdeShellAction,
  dispatchIdeShellExpandFolder,
  dispatchIdeShellOpenFile,
  dispatchIdeShellPlugin,
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
/** Fixed portal menu — must not use absolute under sidebar (center panel stacks on top). */
const menuPortalPanel =
  "fixed z-[1000] rounded-md border border-border bg-background py-1 shadow-lg";
const menuItem =
  "w-full px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50";

function fireAction(type: IdeShellAction): void {
  dispatchIdeShellAction(type);
}

/** Align tree with plugin row: pl-6 + w-6 chevron + gap ≈ start of folder label. */
const PLUGIN_TREE_ROOT_OFFSET_CLASS = "ml-[30px] border-l border-sidebar-border/50 pl-2";
const TREE_DEPTH_PAD_BASE = 4;
const TREE_DEPTH_STEP_PX = 14;

const EditorTabSidebar: React.FC = () => {
  const [state, setState] = useState<IdeShellStateDetail>({
    pluginFolder: "",
    folders: [],
    fileList: [],
    activePath: null,
    busy: false,
    dirtyTabCount: 0,
    hasActiveTab: false,
    tscOnSave: false,
    formatOnSave: false,
    reloadOnSave: false,
  });
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>(
    {},
  );
  const [menu, setMenu] = useState<null | "file" | "edit" | "build">(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const fileBtnRef = useRef<HTMLButtonElement | null>(null);
  const editBtnRef = useRef<HTMLButtonElement | null>(null);
  const buildBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuPortalRef = useRef<HTMLDivElement | null>(null);

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

  useLayoutEffect(() => {
    if (!menu) {
      setMenuPos(null);
      return;
    }
    const ref =
      menu === "file"
        ? fileBtnRef
        : menu === "edit"
          ? editBtnRef
          : buildBtnRef;
    const el = ref.current;
    if (!el) {
      setMenuPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 2, left: r.left });
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node;
      const portal = menuPortalRef.current;
      if (
        portal?.contains(t) ||
        fileBtnRef.current?.contains(t) ||
        editBtnRef.current?.contains(t) ||
        buildBtnRef.current?.contains(t)
      ) {
        return;
      }
      setMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = (): void => {
      setMenu(null);
    };
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  useEffect(() => {
    if (state.pluginFolder) {
      setExpandedFolders((prev) => ({
        ...prev,
        [state.pluginFolder]: true,
      }));
    }
  }, [state.pluginFolder]);

  const pf = state.pluginFolder;
  const busy = state.busy;
  const hasOpen = state.hasActiveTab;
  const dirty = state.dirtyTabCount;

  const toggleFolderExpanded = (folderName: string): void => {
    setExpandedFolders((prev) => {
      const nextOpen = !prev[folderName];
      if (nextOpen) {
        const entry = state.folders.find((f) => f.name === folderName);
        if (entry && entry.fileList == null) {
          dispatchIdeShellExpandFolder(folderName);
        }
      }
      return { ...prev, [folderName]: nextOpen };
    });
  };

  const renderTreeNodes = (
    nodes: FileTreeNode[],
    depth: number,
    treePluginFolder: string,
  ): React.ReactNode =>
    nodes.map((n) => {
      const isDir = n.children.length > 0 || n.path === null;
      const pad = TREE_DEPTH_PAD_BASE + depth * TREE_DEPTH_STEP_PX;
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
              {renderTreeNodes(n.children, depth + 1, treePluginFolder)}
            </ul>
          </li>
        );
      }
      const rel = n.path ?? "";
      const active =
        state.activePath === rel && state.pluginFolder === treePluginFolder;
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
            onClick={() =>
              dispatchIdeShellOpenFile(rel, treePluginFolder)
            }
          >
            {n.name}
          </button>
        </li>
      );
    });

  const menuPortal =
    menu && menuPos
      ? createPortal(
          <div
            ref={menuPortalRef}
            role="menu"
            className={`${menuPortalPanel} ${menu === "build" ? "min-w-[13rem]" : "min-w-[12rem]"}`}
            style={{
              top: menuPos.top,
              left: menuPos.left,
            }}
          >
            {menu === "file" ? (
              <>
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
              </>
            ) : null}
            {menu === "edit" ? (
              <>
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
                  Check types (TS)
                </button>
                <div
                  className="my-1 border-t border-border"
                  role="separator"
                  aria-hidden
                />
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={state.tscOnSave}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("toggleTscOnSave");
                  }}
                >
                  {state.tscOnSave ? "✓ " : ""}
                  Typecheck on save
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={state.formatOnSave}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("toggleFormatOnSave");
                  }}
                >
                  {state.formatOnSave ? "✓ " : ""}
                  Format on save (Prettier)
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={state.reloadOnSave}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("toggleReloadOnSave");
                  }}
                >
                  {state.reloadOnSave ? "✓ " : ""}
                  Reload registry on save
                </button>
              </>
            ) : null}
            {menu === "build" ? (
              <>
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
              </>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-sidebar-border border-b px-1 py-1.5">
        <div className="flex flex-wrap gap-1">
          <button
            ref={fileBtnRef}
            type="button"
            className={menuBtn}
            aria-expanded={menu === "file"}
            aria-haspopup="true"
            onClick={() => setMenu((m) => (m === "file" ? null : "file"))}
          >
            File
          </button>
          <button
            ref={editBtnRef}
            type="button"
            className={menuBtn}
            aria-expanded={menu === "edit"}
            aria-haspopup="true"
            onClick={() => setMenu((m) => (m === "edit" ? null : "edit"))}
          >
            Edit
          </button>
          <button
            ref={buildBtnRef}
            type="button"
            className={menuBtn}
            aria-expanded={menu === "build"}
            aria-haspopup="true"
            onClick={() => setMenu((m) => (m === "build" ? null : "build"))}
          >
            Build
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-sidebar-border border-b px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plugins
          </span>
        </div>
        {state.folders.length === 0 ? (
          <p className="px-3 py-3 text-[11px] text-muted-foreground">
            No plugin workspaces yet. Import or load a parent folder from the
            Build menu.
          </p>
        ) : (
          <ul className="m-0 list-none py-1">
            {state.folders.map((folder) => {
              const open = !!expandedFolders[folder.name];
              const activeWs = folder.name === pf;
              return (
                <li key={folder.name} className="list-none">
                  <div
                    className="flex items-center gap-0.5 py-[2px] pr-2"
                    style={{ paddingLeft: 6 }}
                  >
                    <button
                      type="button"
                      className="flex h-7 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/50"
                      aria-expanded={open}
                      title={open ? "Collapse files" : "Expand files"}
                      aria-label={
                        open ? `Collapse ${folder.name}` : `Expand ${folder.name}`
                      }
                      onClick={() => toggleFolderExpanded(folder.name)}
                    >
                      <span
                        className={`inline-block text-[12px] transition-transform ${open ? "rotate-90" : ""}`}
                      >
                        ›
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`min-w-0 flex-1 truncate rounded-sm px-1 py-1 text-left font-mono text-[12px] hover:bg-muted/40 ${
                        activeWs
                          ? "font-semibold text-foreground"
                          : "text-foreground"
                      }`}
                      title={`Open workspace ${folder.name}`}
                      onClick={() => dispatchIdeShellPlugin(folder.name)}
                    >
                      {folder.name}
                    </button>
                  </div>
                  {open && folder.fileList == null ? (
                    <div
                      className={`pb-2 text-[11px] text-muted-foreground ${PLUGIN_TREE_ROOT_OFFSET_CLASS}`}
                      aria-live="polite"
                    >
                      Loading…
                    </div>
                  ) : null}
                  {open && folder.fileList != null ? (
                    <ul
                      className={`m-0 list-none py-0.5 ${PLUGIN_TREE_ROOT_OFFSET_CLASS}`}
                    >
                      {renderTreeNodes(
                        buildFileTree(folder.fileList),
                        0,
                        folder.name,
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {menuPortal}
    </div>
  );
};

export default EditorTabSidebar;
