import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  dispatchIdeShellAction,
  dispatchIdeShellExpandFolder,
  dispatchIdeShellOpenFile,
  dispatchIdeShellPlugin,
  dispatchIdeShellTreeFsOp,
  dispatchIdeShellTreeSelection,
  IDE_SHELL_STATE_EVENT,
  type IdeShellAction,
  type IdeShellActionPayload,
  type IdeShellStateDetail,
} from "../../plugin-ide/ideShellBridge";

type FileTreeNode = {
  name: string;
  path: string | null;
  children: FileTreeNode[];
};

/** Matches `listPluginSourceFiles` placeholder when `node_modules` exists. */
const NODE_MODULES_LIST_MARKER = "node_modules/";
function isNodeModulesListMarker(rel: string): boolean {
  return rel === NODE_MODULES_LIST_MARKER;
}

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
    if (parts.length === 0) {
      continue;
    }
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

function pathLooksLikeDir(p: string | null): boolean {
  return p != null && p.endsWith("/");
}

/** Depth-first paths matching on-screen tree order (dirs then nested). */
function collectTreePaths(nodes: FileTreeNode[], parentRel: string): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const dirRel = parentRel ? `${parentRel}/${n.name}` : n.name;
    const isDir =
      n.children.length > 0 || n.path === null || pathLooksLikeDir(n.path);
    if (isDir && n.children.length > 0) {
      out.push(dirRel);
      out.push(...collectTreePaths(n.children, dirRel));
    } else if (isDir && n.children.length === 0 && n.path && pathLooksLikeDir(n.path)) {
      out.push(n.path);
    } else if (!isDir && n.path) {
      out.push(n.path);
    }
  }
  return out;
}

const TREE_DND_MIME = "application/x-nodex-tree-dnd";

type DndPayload = {
  fromPlugin: string;
  fromRel: string;
  fromIsDir: boolean;
};

const menuBtn =
  "min-h-7 rounded-sm border border-input bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted/50";
const menuPortalPanel =
  "fixed z-[60000] w-[min(18rem,calc(100vw-12px))] rounded-md border border-border bg-background py-1 shadow-lg";
const menuItem =
  "block w-full px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50";

function fireAction(
  type: IdeShellAction,
  payload?: IdeShellActionPayload,
): void {
  dispatchIdeShellAction(type, payload);
}

/** Paths from the tree may use a trailing `/` for directories; IPC expects no trailing slash. */
function fsRelFromTreePath(p: string): string {
  return p.replace(/\/+$/, "");
}

const PLUGIN_TREE_ROOT_OFFSET_CLASS =
  "ml-[30px] border-l border-sidebar-border/50 pl-2";
const TREE_DEPTH_PAD_BASE = 4;
const TREE_DEPTH_STEP_PX = 14;

type TreeCtxMenu = {
  top: number;
  left: number;
  workspace: string;
  path: string;
  isDir: boolean;
};

/** Right-clicked the plugin workspace title row (not a file path). */
const WORKSPACE_TITLE_CTX_PATH = "\0workspace-title";

const EditorTabSidebar: React.FC = () => {
  const [state, setState] = useState<IdeShellStateDetail>({
    pluginFolder: "",
    folders: [],
    fileList: [],
    activePath: null,
    treeSelectionWorkspace: "",
    treeSelectedPaths: [],
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
  const [ctxMenu, setCtxMenu] = useState<TreeCtxMenu | null>(null);
  const fileBtnRef = useRef<HTMLButtonElement | null>(null);
  const editBtnRef = useRef<HTMLButtonElement | null>(null);
  const buildBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuPortalRef = useRef<HTMLDivElement | null>(null);
  const ctxPortalRef = useRef<HTMLDivElement | null>(null);
  const lastTreeClickRef = useRef<{ workspace: string; path: string } | null>(
    null,
  );

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent<IdeShellStateDetail>).detail;
      if (d && typeof d === "object") {
        setState({
          ...d,
          treeSelectedPaths: d.treeSelectedPaths ?? [],
          treeSelectionWorkspace: d.treeSelectionWorkspace ?? "",
        });
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
    if (!ctxMenu) {
      return;
    }
    const onDown = (ev: MouseEvent) => {
      if (ev.button !== 0) {
        return;
      }
      const t = ev.target as Node;
      if (ctxPortalRef.current?.contains(t)) {
        return;
      }
      setCtxMenu(null);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

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

  const canPathOp =
    !!pf &&
    !busy &&
    (!!state.activePath ||
      (state.treeSelectionWorkspace === pf &&
        state.treeSelectedPaths.length > 0));

  const singleTreeTarget =
    state.treeSelectionWorkspace === pf && state.treeSelectedPaths.length === 1
      ? state.treeSelectedPaths[0]
      : null;
  const canRename = !!pf && !busy && (!!singleTreeTarget || !!state.activePath);

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

  const handleTreeClick = (
    ev: React.MouseEvent,
    workspace: string,
    relPath: string,
    isDir: boolean,
    orderedPaths: string[],
  ): void => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (ev.shiftKey && lastTreeClickRef.current?.workspace === workspace) {
      const anchor = lastTreeClickRef.current.path;
      const ia = orderedPaths.indexOf(anchor);
      const ib = orderedPaths.indexOf(relPath);
      if (ia >= 0 && ib >= 0) {
        const lo = Math.min(ia, ib);
        const hi = Math.max(ia, ib);
        const range = orderedPaths.slice(lo, hi + 1);
        dispatchIdeShellTreeSelection({ workspace, paths: range });
        lastTreeClickRef.current = { workspace, path: relPath };
        if (!isDir) {
          if (!isNodeModulesListMarker(relPath)) {
            dispatchIdeShellOpenFile(relPath, workspace);
          }
        } else {
          dispatchIdeShellPlugin(workspace);
        }
        return;
      }
    }
    if (mod && state.treeSelectionWorkspace === workspace) {
      const set = new Set(state.treeSelectedPaths);
      if (set.has(relPath)) {
        set.delete(relPath);
      } else {
        set.add(relPath);
      }
      const next = [...set];
      dispatchIdeShellTreeSelection({ workspace, paths: next });
      lastTreeClickRef.current = { workspace, path: relPath };
      if (!isDir) {
        if (!isNodeModulesListMarker(relPath)) {
          dispatchIdeShellOpenFile(relPath, workspace);
        }
      } else {
        dispatchIdeShellPlugin(workspace);
      }
      return;
    }
    dispatchIdeShellTreeSelection({ workspace, paths: [relPath] });
    lastTreeClickRef.current = { workspace, path: relPath };
    if (!isDir) {
      if (!isNodeModulesListMarker(relPath)) {
        dispatchIdeShellOpenFile(relPath, workspace);
      }
    } else {
      dispatchIdeShellPlugin(workspace);
    }
  };

  const parseDnd = (ev: React.DragEvent): DndPayload | null => {
    const raw = ev.dataTransfer.getData(TREE_DND_MIME);
    if (!raw) {
      return null;
    }
    try {
      const p = JSON.parse(raw) as DndPayload;
      if (
        p &&
        typeof p.fromPlugin === "string" &&
        typeof p.fromRel === "string" &&
        typeof p.fromIsDir === "boolean"
      ) {
        return p;
      }
    } catch {
      /* ignore */
    }
    return null;
  };

  const renderTreeNodes = (
    nodes: FileTreeNode[],
    depth: number,
    treePluginFolder: string,
    parentRel: string,
    orderedPaths: string[],
  ): React.ReactNode =>
    nodes.map((n) => {
      const isDir =
        n.children.length > 0 ||
        n.path === null ||
        pathLooksLikeDir(n.path);
      const pad = TREE_DEPTH_PAD_BASE + depth * TREE_DEPTH_STEP_PX;
      const dirRel = parentRel ? `${parentRel}/${n.name}` : n.name;
      const rowPath =
        isDir && n.children.length > 0
          ? dirRel
          : (n.path ?? dirRel);
      const selected =
        state.treeSelectionWorkspace === treePluginFolder &&
        state.treeSelectedPaths.includes(rowPath);
      if (isDir && n.children.length > 0) {
        const rowSelected = selected;
        return (
          <li key={`${depth}-${dirRel}`} className="list-none">
            <div
              draggable
              className={`flex cursor-grab truncate py-[3px] font-mono text-[12px] active:cursor-grabbing ${
                rowSelected
                  ? "border-l-2 border-primary bg-muted/50 text-foreground"
                  : "border-l-2 border-transparent text-muted-foreground"
              }`}
              style={{ paddingLeft: pad }}
              onDragStart={(ev) => {
                ev.dataTransfer.setData(
                  TREE_DND_MIME,
                  JSON.stringify({
                    fromPlugin: treePluginFolder,
                    fromRel: dirRel,
                    fromIsDir: true,
                  } satisfies DndPayload),
                );
                ev.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragOver={(ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = ev.shiftKey ? "copy" : "move";
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                const p = parseDnd(ev);
                if (!p) {
                  return;
                }
                if (
                  p.fromPlugin === treePluginFolder &&
                  (p.fromRel === dirRel || dirRel.startsWith(p.fromRel + "/"))
                ) {
                  return;
                }
                dispatchIdeShellTreeFsOp({
                  kind: ev.shiftKey ? "dndCopy" : "dndMove",
                  fromPlugin: p.fromPlugin,
                  fromRel: p.fromRel,
                  fromIsDir: p.fromIsDir,
                  toPlugin: treePluginFolder,
                  toDirRel: dirRel,
                });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setCtxMenu({
                  top: ev.clientY,
                  left: ev.clientX,
                  workspace: treePluginFolder,
                  path: dirRel,
                  isDir: true,
                });
              }}
              onClick={(ev) =>
                handleTreeClick(ev, treePluginFolder, dirRel, true, orderedPaths)
              }
              title={dirRel}
            >
              <span className="mr-1 inline-block w-3 shrink-0 text-[10px] text-muted-foreground/90">
                ▸
              </span>
              <span className="font-medium">{n.name}</span>
            </div>
            <ul className="m-0 p-0">
              {renderTreeNodes(
                n.children,
                depth + 1,
                treePluginFolder,
                dirRel,
                orderedPaths,
              )}
            </ul>
          </li>
        );
      }
      const rel = n.path ?? "";
      const active =
        state.activePath === rel && state.pluginFolder === treePluginFolder;
      const rowSel =
        state.treeSelectionWorkspace === treePluginFolder &&
        state.treeSelectedPaths.includes(rel);
      if (isNodeModulesListMarker(rel)) {
        return (
          <li key={rel} className="list-none">
            <div
              className={`w-full cursor-default truncate border-l-2 py-[4px] pr-2 text-left font-mono text-[12px] leading-snug text-muted-foreground ${
                rowSel ? "border-primary bg-muted/50" : "border-transparent"
              }`}
              style={{ paddingLeft: pad }}
              title="npm dependencies (on disk; not opened in editor)"
              onContextMenu={(ev) => {
                ev.preventDefault();
                setCtxMenu({
                  top: ev.clientY,
                  left: ev.clientX,
                  workspace: treePluginFolder,
                  path: "node_modules",
                  isDir: true,
                });
              }}
              onClick={(ev) =>
                handleTreeClick(ev, treePluginFolder, rel, false, orderedPaths)
              }
            >
              <span className="mr-1 inline-block w-3 shrink-0 text-[10px]">▸</span>
              {n.name}
            </div>
          </li>
        );
      }
      if (pathLooksLikeDir(rel) && !isNodeModulesListMarker(rel)) {
        const fsRel = fsRelFromTreePath(rel);
        return (
          <li key={rel} className="list-none">
            <div
              draggable
              style={{ paddingLeft: pad }}
              className={`flex w-full cursor-grab truncate border-l-2 py-[4px] pr-2 text-left font-mono text-[12px] leading-snug active:cursor-grabbing ${
                rowSel
                  ? "border-primary bg-muted/50 font-medium text-foreground"
                  : "border-transparent text-muted-foreground"
              }`}
              title={rel}
              onDragStart={(ev) => {
                ev.dataTransfer.setData(
                  TREE_DND_MIME,
                  JSON.stringify({
                    fromPlugin: treePluginFolder,
                    fromRel: fsRel,
                    fromIsDir: true,
                  } satisfies DndPayload),
                );
                ev.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragOver={(ev) => {
                ev.preventDefault();
                ev.dataTransfer.dropEffect = ev.shiftKey ? "copy" : "move";
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                const p = parseDnd(ev);
                if (!p) {
                  return;
                }
                if (
                  p.fromPlugin === treePluginFolder &&
                  (p.fromRel === fsRel || fsRel.startsWith(p.fromRel + "/"))
                ) {
                  return;
                }
                dispatchIdeShellTreeFsOp({
                  kind: ev.shiftKey ? "dndCopy" : "dndMove",
                  fromPlugin: p.fromPlugin,
                  fromRel: p.fromRel,
                  fromIsDir: p.fromIsDir,
                  toPlugin: treePluginFolder,
                  toDirRel: fsRel,
                });
              }}
              onContextMenu={(ev) => {
                ev.preventDefault();
                setCtxMenu({
                  top: ev.clientY,
                  left: ev.clientX,
                  workspace: treePluginFolder,
                  path: fsRel,
                  isDir: true,
                });
              }}
              onClick={(ev) =>
                handleTreeClick(ev, treePluginFolder, rel, true, orderedPaths)
              }
            >
              <span className="mr-1 inline-block w-3 shrink-0 text-[10px] text-muted-foreground/90">
                ▸
              </span>
              <span className="font-medium">{n.name}</span>
            </div>
          </li>
        );
      }
      return (
        <li key={rel || `${depth}-${n.name}`} className="list-none">
          <button
            type="button"
            draggable
            style={{ paddingLeft: pad }}
            className={`w-full cursor-grab truncate border-l-2 py-[4px] pr-2 text-left font-mono text-[12px] leading-snug transition-colors hover:bg-muted/50 active:cursor-grabbing ${
              active || rowSel
                ? "border-primary bg-muted/50 font-medium text-foreground"
                : "border-transparent text-foreground"
            }`}
            title={rel}
            onDragStart={(ev) => {
              ev.dataTransfer.setData(
                TREE_DND_MIME,
                JSON.stringify({
                  fromPlugin: treePluginFolder,
                  fromRel: rel,
                  fromIsDir: false,
                } satisfies DndPayload),
              );
              ev.dataTransfer.effectAllowed = "copyMove";
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = ev.shiftKey ? "copy" : "move";
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              const p = parseDnd(ev);
              if (!p) {
                return;
              }
              const parentDir = rel.includes("/")
                ? rel.slice(0, rel.lastIndexOf("/"))
                : "";
              if (
                p.fromPlugin === treePluginFolder &&
                (p.fromRel === rel || rel.startsWith(p.fromRel + "/"))
              ) {
                return;
              }
              dispatchIdeShellTreeFsOp({
                kind: ev.shiftKey ? "dndCopy" : "dndMove",
                fromPlugin: p.fromPlugin,
                fromRel: p.fromRel,
                fromIsDir: p.fromIsDir,
                toPlugin: treePluginFolder,
                toDirRel: parentDir,
              });
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              setCtxMenu({
                top: ev.clientY,
                left: ev.clientX,
                workspace: treePluginFolder,
                path: rel,
                isDir: false,
              });
            }}
            onClick={(ev) =>
              handleTreeClick(ev, treePluginFolder, rel, false, orderedPaths)
            }
          >
            <span className="mr-1 inline-block w-3 shrink-0 text-center text-[10px] text-muted-foreground">
              ·
            </span>
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
            className={menuPortalPanel}
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
                  disabled={!pf || busy}
                  className={menuItem}
                  title="Copy files from a chosen folder into the current plugin root"
                  onClick={() => {
                    setMenu(null);
                    fireAction("importFolder");
                  }}
                >
                  Import folder into plugin…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  className={menuItem}
                  title="Pick a plugin folder on disk and register it as another workspace"
                  onClick={() => {
                    setMenu(null);
                    fireAction("importNewWorkspace");
                  }}
                >
                  Add plugin workspace…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canPathOp}
                  className={`${menuItem} font-medium text-foreground/90 hover:bg-muted`}
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
                  disabled={!canRename}
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
                  disabled={!canPathOp}
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
                  disabled={!canPathOp}
                  className={menuItem}
                  onClick={() => {
                    setMenu(null);
                    fireAction("cut");
                  }}
                >
                  Cut
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
                  className={`${menuItem} text-foreground/90 hover:bg-muted`}
                  title="Only removes plugins registered via “Load parent” or “Add plugin workspace”. Plugins under userData sources/ stay in the manager."
                  onClick={() => {
                    setMenu(null);
                    fireAction("removeExternal");
                  }}
                >
                  Remove from IDE list
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

  const ctxPortal =
    ctxMenu &&
    createPortal(
      <div
        ref={ctxPortalRef}
        role="menu"
        className={menuPortalPanel}
        style={{ top: ctxMenu.top, left: ctxMenu.left }}
      >
        {ctxMenu.path === WORKSPACE_TITLE_CTX_PATH ? (
          <>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              disabled={busy}
              onClick={() => {
                dispatchIdeShellPlugin(ctxMenu.workspace);
                setCtxMenu(null);
              }}
            >
              Open this workspace
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              disabled={busy}
              onClick={() => {
                fireAction("importNewWorkspace");
                setCtxMenu(null);
              }}
            >
              Add plugin workspace…
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${menuItem} text-foreground/90 hover:bg-muted`}
              disabled={busy}
              onClick={() => {
                fireAction("removeExternal", {
                  targetWorkspace: ctxMenu.workspace,
                });
                setCtxMenu(null);
              }}
            >
              Remove from IDE list
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              disabled={busy}
              onClick={() => {
                fireAction("copy", {
                  targetPaths: [fsRelFromTreePath(ctxMenu.path)],
                  targetWorkspace: ctxMenu.workspace,
                });
                setCtxMenu(null);
              }}
            >
              Copy
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              disabled={busy}
              onClick={() => {
                fireAction("cut", {
                  targetPaths: [fsRelFromTreePath(ctxMenu.path)],
                  targetWorkspace: ctxMenu.workspace,
                });
                setCtxMenu(null);
              }}
            >
              Cut
            </button>
            <button
              type="button"
              role="menuitem"
              className={menuItem}
              disabled={busy}
              onClick={() => {
                fireAction("rename", {
                  targetPaths: [fsRelFromTreePath(ctxMenu.path)],
                  targetWorkspace: ctxMenu.workspace,
                });
                setCtxMenu(null);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${menuItem} font-medium text-foreground/90 hover:bg-muted`}
              disabled={busy}
              onClick={() => {
                fireAction("delete", {
                  targetPaths: [fsRelFromTreePath(ctxMenu.path)],
                  targetWorkspace: ctxMenu.workspace,
                });
                setCtxMenu(null);
              }}
            >
              Delete
            </button>
            {ctxMenu.isDir ? (
              <button
                type="button"
                role="menuitem"
                className={menuItem}
                disabled={busy}
                onClick={() => {
                  fireAction("paste", {
                    pasteIntoDir: fsRelFromTreePath(ctxMenu.path),
                  });
                  setCtxMenu(null);
                }}
              >
                Paste into folder
              </button>
            ) : null}
          </>
        )}
      </div>,
      document.body,
    );

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
            No plugin workspaces yet. Use File → Add plugin workspace…, or Build
            → Load parent (.nodexplugin).
          </p>
        ) : (
          <ul className="m-0 list-none py-1">
            {state.folders.map((folder) => {
              const open = !!expandedFolders[folder.name];
              const activeWs = folder.name === pf;
              const tree = buildFileTree(folder.fileList ?? []);
              const orderedPaths = collectTreePaths(tree, "");
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
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        setCtxMenu({
                          top: ev.clientY,
                          left: ev.clientX,
                          workspace: folder.name,
                          path: WORKSPACE_TITLE_CTX_PATH,
                          isDir: true,
                        });
                      }}
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
                      onDragOver={(ev) => {
                        ev.preventDefault();
                        ev.dataTransfer.dropEffect = ev.shiftKey ? "copy" : "move";
                      }}
                      onDrop={(ev) => {
                        ev.preventDefault();
                        const p = parseDnd(ev);
                        if (!p) {
                          return;
                        }
                        dispatchIdeShellTreeFsOp({
                          kind: ev.shiftKey ? "dndCopy" : "dndMove",
                          fromPlugin: p.fromPlugin,
                          fromRel: p.fromRel,
                          fromIsDir: p.fromIsDir,
                          toPlugin: folder.name,
                          toDirRel: "",
                        });
                      }}
                    >
                      {renderTreeNodes(tree, 0, folder.name, "", orderedPaths)}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {menuPortal}
      {ctxPortal}
    </div>
  );
};

export default EditorTabSidebar;
