import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import {
  editor as monacoEditor,
  MarkerSeverity,
  typescript as monacoTypescript,
} from "monaco-editor";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { Note } from "../../preload";
import { joinFileUri } from "../../shared/file-uri";
import { NODEX_PLUGIN_UI_MONACO_URI } from "../../shared/nodex-plugin-ui-monaco-uri";
import SecurePluginRenderer from "./renderers/SecurePluginRenderer";
import { useTheme } from "../theme/ThemeContext";
import { useToast } from "../toast/ToastContext";
import { clientLog } from "../logging/clientLog";
import {
  IDE_SHELL_ACTION_EVENT,
  IDE_SHELL_EXPAND_FOLDER_EVENT,
  IDE_SHELL_OPEN_FILE_EVENT,
  IDE_SHELL_PLUGIN_EVENT,
  IDE_SHELL_STATE_EVENT,
  IDE_SHELL_TREE_FS_OP_EVENT,
  IDE_SHELL_TREE_SELECTION_EVENT,
  type IdeShellAction,
  type IdeShellActionPayload,
  type IdeShellOpenFileDetail,
  type IdeShellStateDetail,
  type IdeShellTreeFsOpDetail,
} from "../plugin-ide/ideShellBridge";

const PLUGIN_IDE_FILES_COLLAPSED_KEY = "plugin-ide-files-collapsed";
const PLUGIN_IDE_TSC_ON_SAVE_KEY = "plugin-ide-tsc-on-save";
const PLUGIN_IDE_FORMAT_ON_SAVE_KEY = "plugin-ide-format-on-save";
const PLUGIN_IDE_RELOAD_ON_SAVE_KEY = "plugin-ide-reload-on-save";
/** Same width as shell `EditorTabSidebar` menus (fixed avoids full-width `fixed`/`absolute` panels). */
const PLUGIN_IDE_TOOLBAR_MENU_PANEL =
  "absolute left-0 top-full z-50 mt-1 w-[min(18rem,calc(100vw-12px))] rounded-md border border-border bg-background py-1 shadow-lg";
const PLUGIN_IDE_SNAPSHOT_KEY = "plugin-ide-workspace-snapshot-v1";
const PLUGIN_IDE_MAX_SNAPSHOT_FILE_BYTES = 500 * 1024;
const NPM_DEBOUNCE_MS = 280;
const PLUGIN_IDE_CUSTOM_EDITOR_KEY = "plugin-ide-custom-editor-cmd";

interface OpenTab {
  relativePath: string;
  content: string;
  savedContent: string;
  /** Disk mtime when buffer last matched disk (open/save); null until known. */
  diskMtimeMs: number | null;
}

interface StoredWorkspaceSnapshot {
  tabs: OpenTab[];
  activePath: string | null;
  cursors: Record<string, { lineNumber: number; column: number }>;
}

function readSnapshotMap(): Record<string, StoredWorkspaceSnapshot> {
  try {
    const raw = localStorage.getItem(PLUGIN_IDE_SNAPSHOT_KEY);
    if (!raw) {
      return {};
    }
    const p = JSON.parse(raw) as Record<string, StoredWorkspaceSnapshot>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeSnapshotMap(m: Record<string, StoredWorkspaceSnapshot>): void {
  try {
    localStorage.setItem(PLUGIN_IDE_SNAPSHOT_KEY, JSON.stringify(m));
  } catch {
    /* quota */
  }
}

function formatImportedPathsForStatus(imported: string[] | undefined): string {
  if (!imported?.length) {
    return "";
  }
  const maxShow = 12;
  const head = imported.slice(0, maxShow).join(", ");
  const more =
    imported.length > maxShow
      ? ` (+${imported.length - maxShow} more)`
      : "";
  return ` — ${head}${more}`;
}

interface PluginIDEProps {
  onPluginsChanged?: () => void;
  /** VS Code–style shell: menus + file tree live in the primary sidebar. */
  shellLayout?: boolean;
}

type PathModalState =
  | null
  | { kind: "newFile"; value: string }
  | { kind: "newFolder"; value: string }
  | { kind: "rename"; from: string; value: string };

/** Duplicate path as sibling (`file.ts` → `file-copy.ts`, `dir` → `dir-copy`). */
function siblingCopyRelativePath(rel: string, isDir: boolean): string {
  const norm = rel.replace(/\\/g, "/").replace(/\/+$/, "");
  if (isDir) {
    const i = norm.lastIndexOf("/");
    const parent = i >= 0 ? norm.slice(0, i) : "";
    const name = i >= 0 ? norm.slice(i + 1) : norm;
    const next = `${name}-copy`;
    return parent ? `${parent}/${next}` : next;
  }
  const i = norm.lastIndexOf("/");
  const dir = i >= 0 ? norm.slice(0, i) : "";
  const base = i >= 0 ? norm.slice(i + 1) : norm;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) {
    const next = `${base}-copy`;
    return dir ? `${dir}/${next}` : next;
  }
  const stem = base.slice(0, dot);
  const ext = base.slice(dot);
  const next = `${stem}-copy${ext}`;
  return dir ? `${dir}/${next}` : next;
}

function basenameRel(rel: string): string {
  const norm = rel.replace(/\\/g, "/").replace(/\/+$/, "");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

/** First paste attempt: sibling duplicate, or `pasteIntoDir/baseName`. */
function initialPasteDestRel(
  sourceRel: string,
  isDir: boolean,
  pasteIntoDir?: string,
): string {
  const trimmed = pasteIntoDir?.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (trimmed) {
    return `${trimmed}/${basenameRel(sourceRel)}`;
  }
  return siblingCopyRelativePath(sourceRel, isDir);
}

interface InstalledPkg {
  name: string;
  range: string;
  dev: boolean;
}

interface NpmSearchRow {
  name: string;
  version: string;
  description: string;
  popularity: number;
}

interface TscDiagnostic {
  relativePath: string;
  line: number;
  column: number;
  message: string;
  category: "error" | "warning" | "suggestion";
  code: number | undefined;
}

function languageForPath(rel: string): string {
  const lower = rel.toLowerCase();
  if (lower.endsWith(".tsx")) {
    return "typescript";
  }
  if (lower.endsWith(".ts")) {
    return "typescript";
  }
  if (lower.endsWith(".jsx")) {
    return "typescript";
  }
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript";
  }
  if (lower.endsWith(".json")) {
    return "json";
  }
  if (lower.endsWith(".md")) {
    return "markdown";
  }
  if (lower.endsWith(".css")) {
    return "css";
  }
  if (lower.endsWith(".html")) {
    return "html";
  }
  return "plaintext";
}

const monacoBeforeMount: BeforeMount = () => {
  const ts = monacoTypescript;
  const compilerOptions = {
    allowJs: true,
    strict: false,
    jsx: ts.JsxEmit.React,
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    skipLibCheck: true,
    paths: {
      "@nodex/plugin-ui": [NODEX_PLUGIN_UI_MONACO_URI],
    },
  };
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
};

function sampleNoteForType(type: string): Note {
  const contentByType: Record<string, string> = {
    root:
      "# Documentation preview\n\n**Root** notes use the same Markdown UI as `markdown` notes.",
    markdown:
      "# Preview\n\nEdit the plugin and **Bundle & reload** to refresh.\n\n- Item one\n- Item two",
    text: "<p><strong>Rich text</strong> preview for this note type.</p>",
    code: 'function preview() {\n  return "hello";\n}\n',
  };
  const metadata =
    type === "code" ? { language: "javascript" } : undefined;
  return {
    id: "ide-preview",
    type,
    title: "Plugin preview",
    content: contentByType[type] ?? `# Preview (${type})\n\nSample body.`,
    metadata,
  };
}

const PluginIDE: React.FC<PluginIDEProps> = ({
  onPluginsChanged,
  shellLayout = false,
}) => {
  const { resolvedDark } = useTheme();
  const monacoTheme = resolvedDark ? "vs-dark" : "vs";
  const { showToast } = useToast();

  const [folders, setFolders] = useState<string[]>([]);
  const [folderFilesCache, setFolderFilesCache] = useState<
    Record<string, string[] | undefined>
  >({});
  const [pluginFolder, setPluginFolder] = useState<string>("");
  /** Absolute workspace as file:// so Monaco resolves imports like runtime (cache-backed virtual node_modules). */
  const [workspaceRootFileUri, setWorkspaceRootFileUri] = useState("");
  const [fileList, setFileList] = useState<string[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewRev, setPreviewRev] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!status) {
      return;
    }
    const s = status.toLowerCase();
    let severity: "error" | "warning" | "info" | "log" = "info";
    if (
      s.includes("fail") ||
      /\berror\b/.test(s) ||
      s.includes("could not") ||
      s.includes("invalid") ||
      s.includes("not valid")
    ) {
      severity = "error";
    } else if (s.includes("warn")) {
      severity = "warning";
    }
    showToast({
      severity,
      message: status,
      mergeKey: `plugin-ide:${severity}`,
    });
  }, [status, showToast]);
  const [pathModal, setPathModal] = useState<PathModalState>(null);
  const filesPanelRef = useRef<ImperativePanelHandle | null>(null);
  const npmWrapRef = useRef<HTMLDivElement | null>(null);

  const [npmQuery, setNpmQuery] = useState("");
  const [npmResults, setNpmResults] = useState<NpmSearchRow[]>([]);
  const [npmLoading, setNpmLoading] = useState(false);
  const [npmMenuOpen, setNpmMenuOpen] = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState<
    null | "file" | "edit" | "build"
  >(null);
  const toolbarMenuRef = useRef<HTMLDivElement | null>(null);
  const [addAsDevDep, setAddAsDevDep] = useState(false);
  const [installedPkgs, setInstalledPkgs] = useState<InstalledPkg[]>([]);
  const [tscDiagnostics, setTscDiagnostics] = useState<TscDiagnostic[]>([]);
  const [tscOnSave, setTscOnSave] = useState(
    () => localStorage.getItem(PLUGIN_IDE_TSC_ON_SAVE_KEY) === "1",
  );
  const [reloadOnSave, setReloadOnSave] = useState(
    () => localStorage.getItem(PLUGIN_IDE_RELOAD_ON_SAVE_KEY) === "1",
  );
  const [formatOnSave, setFormatOnSave] = useState(
    () => localStorage.getItem(PLUGIN_IDE_FORMAT_ON_SAVE_KEY) === "1",
  );
  const [diskConflictPath, setDiskConflictPath] = useState<string | null>(
    null,
  );
  const diskConflictPathRef = useRef<string | null>(null);
  diskConflictPathRef.current = diskConflictPath;
  const [treeSelectedPaths, setTreeSelectedPaths] = useState<string[]>([]);
  const [treeSelectionWorkspace, setTreeSelectionWorkspace] = useState("");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [canScaffold, setCanScaffold] = useState(false);

  useEffect(() => {
    if (!previewExpanded) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPreviewExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewExpanded]);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const pluginFolderRef = useRef("");
  const pendingShellOpenRef = useRef<string | null>(null);
  const tabsRef = useRef<OpenTab[]>([]);
  const activePathRef = useRef<string | null>(null);
  const cursorByPathRef = useRef<
    Record<string, { lineNumber: number; column: number }>
  >({});
  const prevActivePathForCursorRef = useRef<string | null>(null);
  const reloadAfterSaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pathClipboardRef = useRef<{
    sourcePluginFolder: string;
    entries: { rel: string; isDir: boolean }[];
    mode: "copy" | "cut";
  } | null>(null);
  const ideTypingsLoadedRef = useRef(false);
  const pluginDepTypingsDisposablesRef = useRef<{ dispose: () => void }[]>(
    [],
  );

  const activeTab = useMemo(
    () => tabs.find((t) => t.relativePath === activePath) ?? null,
    [tabs, activePath],
  );

  tabsRef.current = tabs;
  activePathRef.current = activePath;
  pluginFolderRef.current = pluginFolder;

  const dirtyTabCount = useMemo(
    () => tabs.filter((t) => t.content !== t.savedContent).length,
    [tabs],
  );

  const flushWorkspaceSnapshot = useCallback((pluginId: string) => {
    if (!pluginId) {
      return;
    }
    const tabsSnap: OpenTab[] = [];
    for (const t of tabsRef.current) {
      if (
        t.content.length > PLUGIN_IDE_MAX_SNAPSHOT_FILE_BYTES ||
        t.savedContent.length > PLUGIN_IDE_MAX_SNAPSHOT_FILE_BYTES
      ) {
        continue;
      }
      tabsSnap.push({ ...t });
    }
    const cursors = { ...cursorByPathRef.current };
    const ap = activePathRef.current;
    const ed = editorRef.current;
    if (ed && ap) {
      const pos = ed.getPosition();
      if (pos) {
        cursors[ap] = {
          lineNumber: pos.lineNumber,
          column: pos.column,
        };
      }
    }
    const snap: StoredWorkspaceSnapshot = {
      tabs: tabsSnap,
      activePath: ap,
      cursors,
    };
    const all = readSnapshotMap();
    all[pluginId] = snap;
    writeSnapshotMap(all);
  }, []);

  const refreshTypes = useCallback(async () => {
    const t = await window.Nodex.getRegisteredTypes();
    setTypes(t);
    setPreviewType((cur) => (t.includes(cur) ? cur : t[0] ?? ""));
  }, []);

  const scheduleReloadAfterSave = useCallback(() => {
    if (!reloadOnSave) {
      return;
    }
    if (reloadAfterSaveTimerRef.current) {
      clearTimeout(reloadAfterSaveTimerRef.current);
    }
    reloadAfterSaveTimerRef.current = setTimeout(() => {
      reloadAfterSaveTimerRef.current = null;
      void (async () => {
        try {
          const r = await window.Nodex.reloadPluginRegistry();
          if (r.success) {
            setPreviewRev((x) => x + 1);
            await refreshTypes();
            onPluginsChanged?.();
          }
        } catch {
          /* ignore */
        }
      })();
    }, 500);
  }, [reloadOnSave, refreshTypes, onPluginsChanged]);

  const refreshFileList = useCallback(async () => {
    if (!pluginFolder) {
      setFileList([]);
      return;
    }
    try {
      const files = await window.Nodex.listPluginSourceFiles(pluginFolder);
      setFileList(files);
      setFolderFilesCache((prev) => ({ ...prev, [pluginFolder]: files }));
    } catch (e) {
      setFileList([]);
      setStatus(
        e instanceof Error ? e.message : "Could not list plugin files",
      );
    }
  }, [pluginFolder]);

  const checkDiskConflicts = useCallback(async () => {
    const pf = pluginFolderRef.current;
    if (!pf || diskConflictPathRef.current) {
      return;
    }
    for (const t of tabsRef.current) {
      if (t.content === t.savedContent) {
        continue;
      }
      if (t.diskMtimeMs == null) {
        continue;
      }
      try {
        const meta = await window.Nodex.getPluginSourceFileMeta(
          pf,
          t.relativePath,
        );
        if (!meta) {
          continue;
        }
        if (meta.mtimeMs > t.diskMtimeMs) {
          setDiskConflictPath(t.relativePath);
          setStatus(
            `File changed on disk: ${t.relativePath} (unsaved edits in editor).`,
          );
          return;
        }
      } catch {
        /* ignore */
      }
    }
  }, []);

  const refreshWorkspaceFolders = useCallback(async () => {
    const list = await window.Nodex.listPluginWorkspaceFolders();
    setFolders(list);
    setFolderFilesCache((prev) => {
      const next: Record<string, string[] | undefined> = {};
      for (const name of list) {
        if (prev[name] !== undefined) {
          next[name] = prev[name];
        }
      }
      return next;
    });
    setPluginFolder((cur) => (list.includes(cur) ? cur : list[0] ?? ""));
  }, []);

  useEffect(() => {
    void refreshWorkspaceFolders();
    void refreshTypes();
  }, [refreshTypes, refreshWorkspaceFolders]);

  useEffect(() => {
    return () => {
      if (reloadAfterSaveTimerRef.current) {
        clearTimeout(reloadAfterSaveTimerRef.current);
        reloadAfterSaveTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void window.Nodex.setIdeWorkspaceWatch(pluginFolder || null);
    return () => {
      void window.Nodex.setIdeWorkspaceWatch(null);
    };
  }, [pluginFolder]);

  useEffect(() => {
    const off = window.Nodex.onIdeWorkspaceFsChanged(() => {
      void refreshFileList();
      void checkDiskConflicts();
    });
    return off;
  }, [refreshFileList, checkDiskConflicts]);

  useEffect(() => {
    void refreshFileList();
  }, [refreshFileList]);

  useEffect(() => {
    if (!pluginFolder) {
      setCanScaffold(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const k = await window.Nodex.getPluginSourceEntryKind(
          pluginFolder,
          "manifest.json",
        );
        if (!cancelled) {
          setCanScaffold(k === "missing");
        }
      } catch {
        if (!cancelled) {
          setCanScaffold(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginFolder, fileList]);

  useEffect(() => {
    const id = pluginFolder;
    return () => {
      if (id) {
        flushWorkspaceSnapshot(id);
      }
    };
  }, [pluginFolder, flushWorkspaceSnapshot]);

  useEffect(() => {
    setDiskConflictPath(null);
    setTreeSelectedPaths([]);
    setTreeSelectionWorkspace("");
    if (!pluginFolder) {
      setTabs([]);
      setActivePath(null);
      cursorByPathRef.current = {};
      prevActivePathForCursorRef.current = null;
      return;
    }
    const snap = readSnapshotMap()[pluginFolder];
    if (!snap?.tabs?.length) {
      setTabs([]);
      setActivePath(null);
      cursorByPathRef.current = {};
      prevActivePathForCursorRef.current = null;
    } else {
      const normalized: OpenTab[] = snap.tabs.map((t) => ({
        relativePath: t.relativePath,
        content: t.content,
        savedContent: t.savedContent,
        diskMtimeMs:
          typeof (t as OpenTab).diskMtimeMs === "number"
            ? (t as OpenTab).diskMtimeMs
            : null,
      }));
      setTabs(normalized);
      const ap =
        snap.activePath &&
        normalized.some((t) => t.relativePath === snap.activePath)
          ? snap.activePath
          : (normalized[0]?.relativePath ?? null);
      setActivePath(ap);
      cursorByPathRef.current = { ...snap.cursors };
      prevActivePathForCursorRef.current = ap;
      const pf = pluginFolder;
      void (async () => {
        const metas = await Promise.all(
          normalized.map(async (t) => {
            const m = await window.Nodex.getPluginSourceFileMeta(
              pf,
              t.relativePath,
            );
            return { rel: t.relativePath, mtime: m?.mtimeMs ?? null };
          }),
        );
        setTabs((prev) =>
          prev.map((t) => {
            if (t.diskMtimeMs != null) {
              return t;
            }
            const row = metas.find((x) => x.rel === t.relativePath);
            return row ? { ...t, diskMtimeMs: row.mtime } : t;
          }),
        );
      })();
    }
  }, [pluginFolder]);

  useEffect(() => {
    const prev = prevActivePathForCursorRef.current;
    if (prev && editorRef.current) {
      const pos = editorRef.current.getPosition();
      if (pos) {
        cursorByPathRef.current[prev] = {
          lineNumber: pos.lineNumber,
          column: pos.column,
        };
      }
    }
    prevActivePathForCursorRef.current = activePath;
  }, [activePath]);

  useEffect(() => {
    if (!activePath) {
      return;
    }
    const pos = cursorByPathRef.current[activePath];
    if (!pos) {
      return;
    }
    let cancelled = false;
    const outer = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) {
          return;
        }
        const ed = editorRef.current;
        if (!ed) {
          return;
        }
        ed.setPosition({
          lineNumber: pos.lineNumber,
          column: pos.column,
        });
        ed.revealPositionInCenter({
          lineNumber: pos.lineNumber,
          column: pos.column,
        });
        delete cursorByPathRef.current[activePath];
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outer);
    };
  }, [activePath, workspaceRootFileUri]);

  useEffect(() => {
    let cancelled = false;
    const disposePluginDepTypings = () => {
      for (const d of pluginDepTypingsDisposablesRef.current) {
        d.dispose();
      }
      pluginDepTypingsDisposablesRef.current = [];
    };

    disposePluginDepTypings();
    setWorkspaceRootFileUri("");

    if (!pluginFolder) {
      return () => {
        cancelled = true;
        disposePluginDepTypings();
      };
    }

    void window.Nodex.getIdePluginTypings(pluginFolder).then((res) => {
      if (cancelled || !res) {
        return;
      }
      setWorkspaceRootFileUri(res.workspaceRootFileUri);
      for (const lib of res.libs) {
        const t = monacoTypescript.typescriptDefaults.addExtraLib(
          lib.content,
          lib.fileName,
        );
        const j = monacoTypescript.javascriptDefaults.addExtraLib(
          lib.content,
          lib.fileName,
        );
        pluginDepTypingsDisposablesRef.current.push(t, j);
      }
    });

    return () => {
      cancelled = true;
      disposePluginDepTypings();
    };
  }, [pluginFolder]);

  useEffect(() => {
    if (!pluginFolder) {
      setInstalledPkgs([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await window.Nodex.readPluginSourceFile(
          pluginFolder,
          "package.json",
        );
        const j = JSON.parse(raw) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const list: InstalledPkg[] = [];
        for (const [name, range] of Object.entries(
          j.dependencies ?? {},
        )) {
          list.push({ name, range, dev: false });
        }
        for (const [name, range] of Object.entries(
          j.devDependencies ?? {},
        )) {
          list.push({ name, range, dev: true });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) {
          setInstalledPkgs(list);
        }
      } catch {
        if (!cancelled) {
          setInstalledPkgs([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginFolder]);

  useEffect(() => {
    const q = npmQuery.trim();
    if (q.length < 2) {
      setNpmResults([]);
      setNpmLoading(false);
      return;
    }
    setNpmLoading(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await window.Nodex.npmRegistrySearch(q);
        if (!res.success) {
          setNpmResults([]);
          setNpmLoading(false);
          return;
        }
        setNpmResults(res.results);
        setNpmLoading(false);
      })();
    }, NPM_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [npmQuery]);

  useEffect(() => {
    if (!npmMenuOpen) {
      return;
    }
    const onDown = (ev: MouseEvent) => {
      const el = npmWrapRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setNpmMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [npmMenuOpen]);

  useEffect(() => {
    if (!toolbarMenu) {
      return;
    }
    const onDown = (ev: MouseEvent) => {
      const el = toolbarMenuRef.current;
      if (el && !el.contains(ev.target as Node)) {
        setToolbarMenu(null);
      }
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setToolbarMenu(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolbarMenu]);

  useEffect(() => {
    if (shellLayout) {
      return;
    }
    const collapsed = localStorage.getItem(PLUGIN_IDE_FILES_COLLAPSED_KEY) === "1";
    const id = window.setTimeout(() => {
      if (collapsed) {
        filesPanelRef.current?.collapse();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [shellLayout]);

  const openFile = async (relativePath: string) => {
    const existing = tabs.find((t) => t.relativePath === relativePath);
    if (existing) {
      setActivePath(relativePath);
      return;
    }
    try {
      const content = await window.Nodex.readPluginSourceFile(
        pluginFolder,
        relativePath,
      );
      const meta = await window.Nodex.getPluginSourceFileMeta(
        pluginFolder,
        relativePath,
      );
      setTabs((prev) => [
        ...prev,
        {
          relativePath,
          content,
          savedContent: content,
          diskMtimeMs: meta?.mtimeMs ?? null,
        },
      ]);
      setActivePath(relativePath);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Open failed");
    }
  };

  const markDirtyFromContent = (value: string | undefined) => {
    if (!activePath || value === undefined) {
      return;
    }
    setTabs((prev) =>
      prev.map((t) =>
        t.relativePath === activePath ? { ...t, content: value } : t,
      ),
    );
  };

  const tryPrettierFormat = useCallback(
    async (content: string, relativePath: string): Promise<string> => {
      if (!pluginFolder || !formatOnSave) {
        return content;
      }
      const lower = relativePath.toLowerCase();
      const dot = lower.lastIndexOf(".");
      const ext = dot >= 0 ? lower.slice(dot + 1) : "";
      const supported = new Set([
        "ts",
        "tsx",
        "js",
        "jsx",
        "mjs",
        "cjs",
        "json",
        "css",
        "md",
      ]);
      if (!supported.has(ext)) {
        return content;
      }
      try {
        const prettier = await import("prettier/standalone");
        const estree = await import("prettier/plugins/estree");
        const plugins: object[] = [estree];
        let parser: string;
        if (ext === "ts" || ext === "tsx") {
          plugins.push(await import("prettier/plugins/typescript"));
          parser = "typescript";
        } else if (
          ext === "js" ||
          ext === "jsx" ||
          ext === "mjs" ||
          ext === "cjs"
        ) {
          plugins.push(await import("prettier/plugins/babel"));
          parser = "babel";
        } else if (ext === "json") {
          plugins.push(await import("prettier/plugins/babel"));
          parser = "json";
        } else if (ext === "css") {
          plugins.push(await import("prettier/plugins/postcss"));
          parser = "css";
        } else {
          plugins.push(await import("prettier/plugins/markdown"));
          parser = "markdown";
        }
        const rc: Record<string, unknown> = {};
        for (const cfg of [".prettierrc.json", ".prettierrc"] as const) {
          try {
            const raw = await window.Nodex.readPluginSourceFile(
              pluginFolder,
              cfg,
            );
            Object.assign(rc, JSON.parse(raw) as Record<string, unknown>);
            break;
          } catch {
            /* try next */
          }
        }
        const out = await prettier.format(content, {
          ...rc,
          parser,
          plugins,
        } as Parameters<typeof prettier.format>[1]);
        return out;
      } catch (e) {
        clientLog({
          component: "PluginIDE",
          level: "warn",
          message: `Prettier: ${e instanceof Error ? e.message : String(e)}`,
        });
        return content;
      }
    },
    [pluginFolder, formatOnSave],
  );

  const saveActive = async (): Promise<boolean> => {
    if (!pluginFolder || !activeTab) {
      return true;
    }
    if (activeTab.content === activeTab.savedContent) {
      return true;
    }
    let toWrite = activeTab.content;
    if (formatOnSave) {
      toWrite = await tryPrettierFormat(
        activeTab.content,
        activeTab.relativePath,
      );
      if (toWrite !== activeTab.content) {
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === activeTab.relativePath
              ? { ...t, content: toWrite }
              : t,
          ),
        );
      }
    }
    const res = await window.Nodex.writePluginSourceFile(
      pluginFolder,
      activeTab.relativePath,
      toWrite,
    );
    if (!res.success) {
      setStatus(res.error ?? "Save failed");
      return false;
    }
    const afterMeta = await window.Nodex.getPluginSourceFileMeta(
      pluginFolder,
      activeTab.relativePath,
    );
    setTabs((prev) =>
      prev.map((t) =>
        t.relativePath === activeTab.relativePath
          ? {
              ...t,
              savedContent: t.content,
              diskMtimeMs: afterMeta?.mtimeMs ?? t.diskMtimeMs,
            }
          : t,
      ),
    );
    setStatus(`Saved ${activeTab.relativePath}`);
    if (tscOnSave && pluginFolder) {
      void (async () => {
        try {
          const tr = await window.Nodex.runPluginTypecheck(pluginFolder);
          setTscDiagnostics(tr.diagnostics);
        } catch {
          // ignore background typecheck errors
        }
      })();
    }
    scheduleReloadAfterSave();
    return true;
  };

  const saveAllDirtyTabs = async (): Promise<boolean> => {
    if (!pluginFolder) {
      return true;
    }
    const dirty = tabs.filter((t) => t.content !== t.savedContent);
    if (dirty.length === 0) {
      setStatus("Nothing to save.");
      return true;
    }
    setBusy(true);
    setStatus(null);
    try {
      for (const t of dirty) {
        let body = t.content;
        if (formatOnSave) {
          body = await tryPrettierFormat(t.content, t.relativePath);
          if (body !== t.content) {
            setTabs((prev) =>
              prev.map((x) =>
                x.relativePath === t.relativePath ? { ...x, content: body } : x,
              ),
            );
          }
        }
        const res = await window.Nodex.writePluginSourceFile(
          pluginFolder,
          t.relativePath,
          body,
        );
        if (!res.success) {
          setStatus(res.error ?? `Save failed: ${t.relativePath}`);
          return false;
        }
      }
      const mtimeByRel: Record<string, number | null> = {};
      for (const t of dirty) {
        const m = await window.Nodex.getPluginSourceFileMeta(
          pluginFolder,
          t.relativePath,
        );
        mtimeByRel[t.relativePath] = m?.mtimeMs ?? null;
      }
      setTabs((prev) =>
        prev.map((t) => {
          if (!(t.relativePath in mtimeByRel)) {
            return t;
          }
          return {
            ...t,
            savedContent: t.content,
            diskMtimeMs:
              mtimeByRel[t.relativePath] ?? t.diskMtimeMs,
          };
        }),
      );
      setStatus(`Saved ${dirty.length} file(s).`);
      if (tscOnSave) {
        void (async () => {
          try {
            const tr = await window.Nodex.runPluginTypecheck(pluginFolder);
            setTscDiagnostics(tr.diagnostics);
          } catch {
            /* ignore */
          }
        })();
      }
      scheduleReloadAfterSave();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const closeTab = (rel: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tab = tabs.find((t) => t.relativePath === rel);
    if (tab && tab.content !== tab.savedContent) {
      if (!confirm(`Discard unsaved changes in ${rel}?`)) {
        return;
      }
    }
    const next = tabs.filter((t) => t.relativePath !== rel);
    setTabs(next);
    if (activePath === rel) {
      setActivePath(next[0]?.relativePath ?? null);
    }
    if (diskConflictPath === rel) {
      setDiskConflictPath(null);
    }
  };

  const resolveDiskConflictReload = async () => {
    const rel = diskConflictPath;
    const pf = pluginFolder;
    if (!rel || !pf) {
      return;
    }
    setBusy(true);
    try {
      const content = await window.Nodex.readPluginSourceFile(pf, rel);
      const meta = await window.Nodex.getPluginSourceFileMeta(pf, rel);
      setTabs((prev) =>
        prev.map((t) =>
          t.relativePath === rel
            ? {
                ...t,
                content,
                savedContent: content,
                diskMtimeMs: meta?.mtimeMs ?? null,
              }
            : t,
        ),
      );
      setDiskConflictPath(null);
      setStatus(`Reloaded ${rel} from disk.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Reload from disk failed");
    } finally {
      setBusy(false);
    }
  };

  const resolveDiskConflictKeepMine = async () => {
    const rel = diskConflictPath;
    const pf = pluginFolder;
    if (!rel || !pf) {
      return;
    }
    const meta = await window.Nodex.getPluginSourceFileMeta(pf, rel);
    setTabs((prev) =>
      prev.map((t) =>
        t.relativePath === rel
          ? { ...t, diskMtimeMs: meta?.mtimeMs ?? t.diskMtimeMs }
          : t,
      ),
    );
    setDiskConflictPath(null);
    setStatus(`Keeping editor version of ${rel}; disk baseline updated.`);
  };

  const bundleLocalOnly = async () => {
    if (!pluginFolder) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      if (activeTab && activeTab.content !== activeTab.savedContent) {
        const ok = await saveActive();
        if (!ok) {
          return;
        }
      }
      const bundle = await window.Nodex.bundlePluginLocal(pluginFolder);
      if (!bundle.success) {
        setStatus(bundle.error ?? "Bundle failed");
        return;
      }
      setStatus("Bundle OK (dist/ updated).");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const bundleAndReload = async () => {
    if (!pluginFolder) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      if (activeTab && activeTab.content !== activeTab.savedContent) {
        const ok = await saveActive();
        if (!ok) {
          setBusy(false);
          return;
        }
      }
      const installRes = await window.Nodex.installPluginDependencies(
        pluginFolder,
      );
      if (!installRes.success) {
        setStatus(installRes.error ?? "npm install failed");
        setBusy(false);
        return;
      }
      const bundle = await window.Nodex.bundlePluginLocal(pluginFolder);
      if (!bundle.success) {
        setStatus(bundle.error ?? "Bundle failed");
        setBusy(false);
        return;
      }
      const reload = await window.Nodex.reloadPluginRegistry();
      if (!reload.success) {
        setStatus(reload.error ?? "Reload failed");
        setBusy(false);
        return;
      }
      setPreviewRev((r) => r + 1);
      await refreshTypes();
      onPluginsChanged?.();
      setStatus(
        "Bundled and registry reloaded. Use File → Copy dist… to export dist/ elsewhere.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const reloadOnly = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const reload = await window.Nodex.reloadPluginRegistry();
      if (!reload.success) {
        setStatus(reload.error ?? "Reload failed");
        return;
      }
      setPreviewRev((r) => r + 1);
      await refreshTypes();
      onPluginsChanged?.();
      setStatus("Registry reloaded.");
    } finally {
      setBusy(false);
    }
  };

  const applyTscMarkers = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || !activePath) {
      return;
    }
    const model = ed.getModel();
    if (!model) {
      return;
    }
    const rel = activePath.replace(/\\/g, "/");
    const markers = tscDiagnostics
      .filter((d) => d.relativePath === rel)
      .map((d) => ({
        startLineNumber: d.line,
        startColumn: d.column,
        endLineNumber: d.line,
        endColumn: d.column + 1,
        message:
          d.code != null ? `[TS${d.code}] ${d.message}` : d.message,
        severity:
          d.category === "error"
            ? MarkerSeverity.Error
            : d.category === "warning"
              ? MarkerSeverity.Warning
              : MarkerSeverity.Info,
      }));
    monacoEditor.setModelMarkers(model, "tsc", markers);
  }, [activePath, tscDiagnostics]);

  useEffect(() => {
    setTscDiagnostics([]);
  }, [pluginFolder]);

  useEffect(() => {
    applyTscMarkers();
  }, [applyTscMarkers]);

  const handleEditorMount: OnMount = useCallback(
    (ed) => {
      editorRef.current = ed;
      if (!ideTypingsLoadedRef.current) {
        ideTypingsLoadedRef.current = true;
        void window.Nodex.getIdeTypings().then((res) => {
          if (!res.libs?.length) {
            return;
          }
          for (const lib of res.libs) {
            monacoTypescript.typescriptDefaults.addExtraLib(
              lib.content,
              lib.fileName,
            );
            monacoTypescript.javascriptDefaults.addExtraLib(
              lib.content,
              lib.fileName,
            );
          }
        });
      }
      requestAnimationFrame(() => {
        applyTscMarkers();
      });
    },
    [applyTscMarkers],
  );

  const runTypecheck = useCallback(async () => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.Nodex.runPluginTypecheck(pluginFolder);
      setTscDiagnostics(res.diagnostics);
      const errCount = res.diagnostics.filter((d) => d.category === "error")
        .length;
      if (res.error) {
        if (res.diagnostics.length === 0) {
          clientLog({
            component: "PluginIDE",
            level: "warn",
            message: res.error,
          });
          setStatus(
            "Typecheck failed: invalid tsconfig or compiler options. Fix tsconfig.json (options like target, module, moduleResolution, jsx must be string values).",
          );
        } else {
          setStatus(res.error);
        }
      } else if (errCount > 0) {
        setStatus(`Typecheck: ${errCount} error(s). See Problems.`);
      } else {
        const hints = res.diagnostics.length;
        setStatus(
          hints > 0
            ? `Types OK (${hints} warning(s)/hint(s)).`
            : "Types OK.",
        );
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Typecheck failed");
      setTscDiagnostics([]);
    } finally {
      setBusy(false);
    }
  }, [pluginFolder, busy]);

  const submitPathModal = async () => {
    if (!pathModal || !pluginFolder || busy) {
      return;
    }
    const raw = pathModal.value.trim().replace(/\\/g, "/");
    if (!raw) {
      setStatus("Path is required.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      if (pathModal.kind === "rename") {
        const toRel = raw.replace(/\/+$/, "");
        if (toRel === pathModal.from) {
          setPathModal(null);
          return;
        }
        const res = await window.Nodex.renamePluginSourcePath(
          pluginFolder,
          pathModal.from,
          toRel,
        );
        if (!res.success) {
          setStatus(res.error ?? "Rename failed");
          return;
        }
        const renamedMeta = await window.Nodex.getPluginSourceFileMeta(
          pluginFolder,
          toRel,
        );
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === pathModal.from
              ? {
                  ...t,
                  relativePath: toRel,
                  diskMtimeMs: renamedMeta?.mtimeMs ?? t.diskMtimeMs,
                }
              : t,
          ),
        );
        setActivePath((ap) => (ap === pathModal.from ? toRel : ap));
        setPathModal(null);
        await refreshFileList();
        setStatus(`Renamed to ${toRel}`);
      } else if (pathModal.kind === "newFile") {
        const res = await window.Nodex.createPluginSourceFile(
          pluginFolder,
          raw,
          "",
        );
        if (!res.success) {
          setStatus(res.error ?? "Create failed");
          return;
        }
        setPathModal(null);
        await refreshFileList();
        await openFile(raw);
        setStatus(`Created ${raw}`);
      } else {
        const normalized = raw.replace(/\/+$/, "");
        const res = await window.Nodex.mkdirPluginSource(
          pluginFolder,
          normalized,
        );
        if (!res.success) {
          setStatus(res.error ?? "Create folder failed");
          return;
        }
        setPathModal(null);
        await refreshFileList();
        setStatus(`Created folder ${normalized}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const onImportFiles = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const paths = await window.Nodex.selectImportFiles();
      if (!paths?.length) {
        return;
      }
      const res = await window.Nodex.importFilesIntoWorkspace(
        pluginFolder,
        paths,
        "",
      );
      if (!res.success) {
        setStatus(res.error ?? "Import failed");
        return;
      }
      await refreshFileList();
      setStatus(
        `Imported ${res.imported?.length ?? 0} file(s) under plugin root.${formatImportedPathsForStatus(res.imported)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onImportFolder = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dir = await window.Nodex.selectImportDirectory();
      if (!dir) {
        return;
      }
      if (pluginFolder) {
        const res = await window.Nodex.importDirectoryIntoWorkspace(
          pluginFolder,
          dir,
          "",
        );
        if (!res.success) {
          setStatus(res.error ?? "Import failed");
          return;
        }
        await refreshFileList();
        setStatus(
          `Imported ${res.imported?.length ?? 0} file(s) from folder under plugin root.${formatImportedPathsForStatus(res.imported)}`,
        );
        return;
      }
      const res = await window.Nodex.importDirectoryAsNewWorkspace(dir);
      if (!res.success) {
        setStatus(res.error ?? "Import failed");
        return;
      }
      await refreshWorkspaceFolders();
      if (res.folderName) {
        setPluginFolder(res.folderName);
      }
      const reload = await window.Nodex.reloadPluginRegistry();
      if (!reload.success) {
        setStatus(
          `Workspace "${res.folderName}" imported, but registry reload failed: ${reload.error ?? "unknown"}.`,
        );
        return;
      }
      setPreviewRev((r) => r + 1);
      await refreshTypes();
      onPluginsChanged?.();
      setStatus(
        `Imported new workspace "${res.folderName}" (${res.imported?.length ?? 0} file(s)).${formatImportedPathsForStatus(res.imported)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const loadNodexFromParent = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.Nodex.loadNodexPluginsFromParent();
      if (res.cancelled) {
        return;
      }
      await refreshWorkspaceFolders();
      const parts: string[] = [];
      if (res.added?.length) {
        parts.push(`Registered: ${res.added.join(", ")}`);
      }
      if (res.warnings?.length) {
        parts.push(...res.warnings);
      }
      if (res.errors?.length) {
        parts.push(`Errors: ${res.errors.join("; ")}`);
      }
      if (parts.length) {
        setStatus(parts.join(" · "));
      } else if (!res.success) {
        setStatus("No plugins found under parent (need .nodexplugin + manifest.json).");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  };

  const removeExternalRegistration = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    if (
      !confirm(
        `Remove “${pluginFolder}” from the external workspace list? (Does not delete files on disk.)`,
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const r = await window.Nodex.removeExternalPluginWorkspace(pluginFolder);
      if (!r.success) {
        setStatus(r.error ?? "Remove failed");
        return;
      }
      setTabs([]);
      setActivePath(null);
      await refreshWorkspaceFolders();
      setStatus(`Removed external registration for ${pluginFolder}.`);
    } finally {
      setBusy(false);
    }
  };

  const copyToInternalClipboard = async (opts?: {
    paths?: string[];
    sourceWorkspace?: string;
  }) => {
    if (busy) {
      return;
    }
    const srcWs = opts?.sourceWorkspace ?? pluginFolder;
    if (!srcWs) {
      return;
    }
    const paths =
      opts?.paths ??
      (treeSelectionWorkspace === pluginFolder && treeSelectedPaths.length > 0
        ? treeSelectedPaths
        : activePath
          ? [activePath]
          : []);
    if (paths.length === 0) {
      setStatus("Select file(s) in the tree or open a file to copy.");
      return;
    }
    setBusy(true);
    try {
      const entries: { rel: string; isDir: boolean }[] = [];
      for (const rel of paths) {
        const kind = await window.Nodex.getPluginSourceEntryKind(srcWs, rel);
        if (kind === "missing") {
          setStatus(`Cannot copy: ${rel} not found.`);
          return;
        }
        entries.push({ rel, isDir: kind === "dir" });
      }
      pathClipboardRef.current = {
        sourcePluginFolder: srcWs,
        entries,
        mode: "copy",
      };
      setStatus(
        entries.length === 1
          ? `Copied ${entries[0].rel} (${entries[0].isDir ? "folder" : "file"}) — use Paste.`
          : `Copied ${entries.length} items — use Paste.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const cutToInternalClipboard = async (opts?: {
    paths?: string[];
    sourceWorkspace?: string;
  }) => {
    if (busy) {
      return;
    }
    const srcWs = opts?.sourceWorkspace ?? pluginFolder;
    if (!srcWs) {
      return;
    }
    const paths =
      opts?.paths ??
      (treeSelectionWorkspace === pluginFolder && treeSelectedPaths.length > 0
        ? treeSelectedPaths
        : activePath
          ? [activePath]
          : []);
    if (paths.length === 0) {
      setStatus("Select file(s) in the tree or open a file to cut.");
      return;
    }
    setBusy(true);
    try {
      const entries: { rel: string; isDir: boolean }[] = [];
      for (const rel of paths) {
        const kind = await window.Nodex.getPluginSourceEntryKind(srcWs, rel);
        if (kind === "missing") {
          setStatus(`Cannot cut: ${rel} not found.`);
          return;
        }
        entries.push({ rel, isDir: kind === "dir" });
      }
      pathClipboardRef.current = {
        sourcePluginFolder: srcWs,
        entries,
        mode: "cut",
      };
      setStatus(
        entries.length === 1
          ? `Cut ${entries[0].rel} (${entries[0].isDir ? "folder" : "file"}) — use Paste to move.`
          : `Cut ${entries.length} items — use Paste to move.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const pasteFromInternalClipboard = async (pasteIntoDir?: string) => {
    if (!pluginFolder || busy) {
      return;
    }
    const clip = pathClipboardRef.current;
    if (!clip?.entries.length) {
      setStatus("Nothing to paste (Copy or Cut first).");
      return;
    }
    const isCut = clip.mode === "cut";
    const srcFolder = clip.sourcePluginFolder;
    setBusy(true);
    try {
      const movedMap = new Map<string, string>();
      const lastNonDirs: string[] = [];
      for (const ent of clip.entries) {
        let destRel = initialPasteDestRel(
          ent.rel,
          ent.isDir,
          pasteIntoDir,
        );
        let attempt = 0;
        let res = isCut
          ? await window.Nodex.movePluginSourceBetweenWorkspaces(
              srcFolder,
              ent.rel,
              pluginFolder,
              destRel,
            )
          : srcFolder === pluginFolder
            ? await window.Nodex.copyPluginSourceWithinWorkspace(
                pluginFolder,
                ent.rel,
                destRel,
              )
            : await window.Nodex.copyPluginSourceBetweenWorkspaces(
                srcFolder,
                ent.rel,
                pluginFolder,
                destRel,
              );
        while (!res.success && attempt < 12) {
          attempt += 1;
          destRel = siblingCopyRelativePath(destRel, ent.isDir);
          res = isCut
            ? await window.Nodex.movePluginSourceBetweenWorkspaces(
                srcFolder,
                ent.rel,
                pluginFolder,
                destRel,
              )
            : srcFolder === pluginFolder
              ? await window.Nodex.copyPluginSourceWithinWorkspace(
                  pluginFolder,
                  ent.rel,
                  destRel,
                )
              : await window.Nodex.copyPluginSourceBetweenWorkspaces(
                  srcFolder,
                  ent.rel,
                  pluginFolder,
                  destRel,
                );
        }
        if (!res.success) {
          setStatus(res.error ?? `Paste failed for ${ent.rel}`);
          return;
        }
        movedMap.set(ent.rel, destRel);
        if (!ent.isDir) {
          lastNonDirs.push(destRel);
        }
      }
      await refreshFileList();
      if (isCut && srcFolder === pluginFolder) {
        const metas = await Promise.all(
          [...movedMap.entries()].map(async ([from, to]) => {
            const m = await window.Nodex.getPluginSourceFileMeta(
              pluginFolder,
              to,
            );
            return { from, to, mtime: m?.mtimeMs ?? null };
          }),
        );
        setTabs((prev) =>
          prev.map((t) => {
            const row = metas.find((x) => x.from === t.relativePath);
            return row
              ? {
                  ...t,
                  relativePath: row.to,
                  diskMtimeMs: row.mtime ?? t.diskMtimeMs,
                }
              : t;
          }),
        );
        setActivePath((ap) => {
          const row = metas.find((x) => x.from === ap);
          return row ? row.to : ap;
        });
      }
      const openTarget = lastNonDirs[lastNonDirs.length - 1];
      if (openTarget) {
        await openFile(openTarget);
      }
      if (isCut) {
        pathClipboardRef.current = null;
        setStatus(
          movedMap.size === 1
            ? `Moved to ${[...movedMap.values()][0]}`
            : `Moved ${movedMap.size} items.`,
        );
      } else {
        setStatus(
          movedMap.size === 1
            ? `Duplicated to ${[...movedMap.values()][0]}`
            : `Duplicated ${movedMap.size} items.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const copyDistToFolder = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const cp = await window.Nodex.copyPluginDistToFolder(pluginFolder);
      setStatus(
        cp.success
          ? "dist/ contents copied."
          : cp.error === "Cancelled"
            ? "Copy cancelled."
            : (cp.error ?? "Copy failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const openRenameModal = (fromPath?: string) => {
    const from =
      fromPath ??
      (treeSelectionWorkspace === pluginFolder &&
      treeSelectedPaths.length === 1
        ? treeSelectedPaths[0]
        : activePath);
    if (!pluginFolder || !from) {
      setStatus("Select a single file or folder in the tree to rename.");
      return;
    }
    setPathModal({ kind: "rename", from, value: from });
  };

  const addRegistryDependency = async (row: NpmSearchRow) => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      let raw: string;
      try {
        raw = await window.Nodex.readPluginSourceFile(
          pluginFolder,
          "package.json",
        );
      } catch {
        raw = JSON.stringify(
          {
            name: pluginFolder,
            version: "1.0.0",
            private: true,
            dependencies: {},
            devDependencies: {},
          },
          null,
          2,
        );
      }
      let j: Record<string, unknown>;
      try {
        j = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        setStatus("package.json is not valid JSON.");
        return;
      }
      const depsKey = addAsDevDep ? "devDependencies" : "dependencies";
      const block = {
        ...((j[depsKey] as Record<string, string>) ?? {}),
      };
      block[row.name] = `^${row.version}`;
      j[depsKey] = block;
      const out = `${JSON.stringify(j, null, 2)}\n`;
      const w = await window.Nodex.writePluginSourceFile(
        pluginFolder,
        "package.json",
        out,
      );
      if (!w.success) {
        setStatus(w.error ?? "Could not write package.json");
        return;
      }
      setNpmMenuOpen(false);
      setNpmQuery("");
      const list: InstalledPkg[] = [];
      const d = (j.dependencies as Record<string, string>) ?? {};
      const dd = (j.devDependencies as Record<string, string>) ?? {};
      for (const [name, range] of Object.entries(d)) {
        list.push({ name, range, dev: false });
      }
      for (const [name, range] of Object.entries(dd)) {
        list.push({ name, range, dev: true });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setInstalledPkgs(list);
      setStatus(
        `Added ${row.name}@${`^${row.version}`} to package.json — run Install dependencies when ready.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "package.json update failed");
    } finally {
      setBusy(false);
    }
  };

  const runInstallDependencies = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.Nodex.installPluginDependencies(pluginFolder);
      if (!res.success) {
        setStatus(res.error ?? "npm install failed");
        return;
      }
      setStatus("Dependencies installed.");
      onPluginsChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const onDeletePath = async (
    explicitPaths?: string[],
    explicitWorkspace?: string,
  ) => {
    const ws = explicitWorkspace ?? pluginFolder;
    if (!ws || busy) {
      return;
    }
    const raw =
      explicitPaths?.length
        ? explicitPaths
        : treeSelectionWorkspace === ws && treeSelectedPaths.length > 0
          ? treeSelectedPaths
          : ws === pluginFolder && activePath
            ? [activePath]
            : [];
    if (raw.length === 0) {
      setStatus("Select file(s) in the tree or open a file to delete.");
      return;
    }
    const targets = [...new Set(raw)].sort(
      (a, b) =>
        b.split("/").length - a.split("/").length || b.localeCompare(a),
    );
    const msg =
      targets.length === 1
        ? `Delete “${targets[0]}”? This cannot be undone.`
        : `Delete ${targets.length} paths? This cannot be undone.`;
    if (!confirm(msg)) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const deleted = new Set<string>();
      for (const p of targets) {
        if (
          [...deleted].some(
            (d) => p === d || p.startsWith(`${d}/`),
          )
        ) {
          continue;
        }
        const res = await window.Nodex.deletePluginSourcePath(ws, p);
        if (!res.success) {
          setStatus(res.error ?? `Delete failed: ${p}`);
          return;
        }
        deleted.add(p);
      }
      const delSet = deleted;
      if (ws === pluginFolder) {
        const nextTabs = tabs.filter((t) => {
          if (delSet.has(t.relativePath)) {
            return false;
          }
          return ![...delSet].some((d) => t.relativePath.startsWith(`${d}/`));
        });
        setTabs(nextTabs);
        if (
          activePath &&
          (delSet.has(activePath) ||
            [...delSet].some((d) => activePath.startsWith(`${d}/`)))
        ) {
          setActivePath(nextTabs[0]?.relativePath ?? null);
        }
      }
      if (treeSelectionWorkspace === ws) {
        setTreeSelectedPaths((prev) =>
          prev.filter(
            (p) =>
              !delSet.has(p) &&
              ![...delSet].some((d) => p.startsWith(`${d}/`)),
          ),
        );
      }
      if (ws === pluginFolder) {
        await refreshFileList();
      } else {
        try {
          const files = await window.Nodex.listPluginSourceFiles(ws);
          setFolderFilesCache((prev) => ({ ...prev, [ws]: files }));
        } catch {
          /* ignore */
        }
      }
      setStatus(
        deleted.size === 1
          ? `Deleted ${[...deleted][0]}`
          : `Deleted ${deleted.size} items.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const runTreeFsOp = useCallback(
    async (d: IdeShellTreeFsOpDetail) => {
      const isDup = d.kind === "dndCopy";
      let destRel = d.toDirRel
        ? `${d.toDirRel.replace(/\/+$/, "")}/${basenameRel(d.fromRel)}`
        : basenameRel(d.fromRel);
      let attempt = 0;
      setBusy(true);
      setStatus(null);
      try {
        let res = isDup
          ? d.fromPlugin === d.toPlugin
            ? await window.Nodex.copyPluginSourceWithinWorkspace(
                d.toPlugin,
                d.fromRel,
                destRel,
              )
            : await window.Nodex.copyPluginSourceBetweenWorkspaces(
                d.fromPlugin,
                d.fromRel,
                d.toPlugin,
                destRel,
              )
          : await window.Nodex.movePluginSourceBetweenWorkspaces(
              d.fromPlugin,
              d.fromRel,
              d.toPlugin,
              destRel,
            );
        while (!res.success && attempt < 16) {
          attempt += 1;
          destRel = siblingCopyRelativePath(destRel, d.fromIsDir);
          res = isDup
            ? d.fromPlugin === d.toPlugin
              ? await window.Nodex.copyPluginSourceWithinWorkspace(
                  d.toPlugin,
                  d.fromRel,
                  destRel,
                )
              : await window.Nodex.copyPluginSourceBetweenWorkspaces(
                  d.fromPlugin,
                  d.fromRel,
                  d.toPlugin,
                  destRel,
                )
            : await window.Nodex.movePluginSourceBetweenWorkspaces(
                d.fromPlugin,
                d.fromRel,
                d.toPlugin,
                destRel,
              );
        }
        if (!res.success) {
          setStatus(res.error ?? "Drag and drop failed");
          return;
        }
        if (d.toPlugin === pluginFolderRef.current) {
          await refreshFileList();
        }
        try {
          const files = await window.Nodex.listPluginSourceFiles(d.toPlugin);
          setFolderFilesCache((prev) => ({ ...prev, [d.toPlugin]: files }));
        } catch {
          /* ignore */
        }
        if (
          d.toPlugin === pluginFolderRef.current &&
          !d.fromIsDir &&
          isDup
        ) {
          await openFileRef.current(destRel);
        }
        setStatus(
          isDup ? `Duplicated to ${destRel}` : `Moved to ${destRel}`,
        );
      } finally {
        setBusy(false);
      }
    },
    [refreshFileList],
  );

  const runScaffold = useCallback(async () => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const r = await window.Nodex.scaffoldPluginWorkspace(pluginFolder);
      if (!r.success) {
        setStatus(r.error ?? "Scaffold failed");
        return;
      }
      setCanScaffold(false);
      await refreshFileList();
      await refreshWorkspaceFolders();
      setStatus(
        "Plugin scaffolded — run Install dependencies, then bundle & reload.",
      );
    } finally {
      setBusy(false);
    }
  }, [pluginFolder, busy, refreshFileList, refreshWorkspaceFolders]);

  const runExternalEditorChoice = useCallback(
    async (v: string) => {
      if (!pluginFolder || !v) {
        return;
      }
      if (v === "reveal") {
        const r = await window.Nodex.revealPluginWorkspaceInFileManager(
          pluginFolder,
        );
        setStatus(
          r.success
            ? "Opened folder in file manager."
            : (r.error ?? "Reveal failed"),
        );
        return;
      }
      if (v === "custom") {
        const prev = localStorage.getItem(PLUGIN_IDE_CUSTOM_EDITOR_KEY) ?? "";
        const cmd = window.prompt(
          "Shell command to run in the plugin folder (e.g. myeditor)",
          prev,
        );
        if (!cmd?.trim()) {
          return;
        }
        localStorage.setItem(PLUGIN_IDE_CUSTOM_EDITOR_KEY, cmd.trim());
        const r = await window.Nodex.openPluginWorkspaceInEditor({
          editor: "custom",
          customBin: cmd.trim(),
          pluginName: pluginFolder,
        });
        setStatus(
          r.success ? `Launched: ${cmd.trim()}` : (r.error ?? "Launch failed"),
        );
        return;
      }
      const r = await window.Nodex.openPluginWorkspaceInEditor({
        editor: v,
        pluginName: pluginFolder,
      });
      setStatus(
        r.success ? `Opened folder in ${v}.` : (r.error ?? "Launch failed"),
      );
    },
    [pluginFolder],
  );

  const workspaceToolsControls = (
    <>
      {canScaffold ? (
        <button
          type="button"
          disabled={busy}
          className="rounded-sm border border-amber-600/50 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-950 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-100"
          onClick={() => void runScaffold()}
        >
          Initialize plugin
        </button>
      ) : null}
      <select
        className="max-w-[12rem] rounded-sm border border-input bg-background px-2 py-1 text-[11px]"
        disabled={!pluginFolder || busy}
        aria-label="Open plugin folder in external app"
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          void runExternalEditorChoice(v);
        }}
      >
        <option value="">Open folder in…</option>
        <option value="vscode">VS Code</option>
        <option value="cursor">Cursor</option>
        <option value="windsurf">Windsurf</option>
        <option value="anigravity">Antigravity</option>
        <option value="custom">Custom command…</option>
        <option value="reveal">File manager</option>
      </select>
      <button
        type="button"
        className="rounded-sm border border-input bg-background px-2 py-1 text-[11px] hover:bg-muted/50"
        disabled={busy}
        title="Electron DevTools for this window (inspect host + plugin iframe)"
        onClick={() => void window.Nodex.toggleDeveloperTools()}
      >
        DevTools
      </button>
    </>
  );

  const previewNote = useMemo(
    () => (previewType ? sampleNoteForType(previewType) : null),
    [previewType],
  );

  const ideActionsRef = useRef({
    saveActive,
    saveAllDirtyTabs,
    runTypecheck,
    bundleLocalOnly,
    bundleAndReload,
    reloadOnly,
    onImportFiles,
    onImportFolder,
    loadNodexFromParent,
    removeExternalRegistration,
    copyDistToFolder,
    copyToInternalClipboard,
    cutToInternalClipboard,
    pasteFromInternalClipboard,
    openRenameModal,
    runInstallDependencies,
    onDeletePath,
    openNewFileModal: () =>
      setPathModal({ kind: "newFile", value: "newfile.js" }),
    openNewFolderModal: () =>
      setPathModal({ kind: "newFolder", value: "lib" }),
  });
  ideActionsRef.current = {
    saveActive,
    saveAllDirtyTabs,
    runTypecheck,
    bundleLocalOnly,
    bundleAndReload,
    reloadOnly,
    onImportFiles,
    onImportFolder,
    loadNodexFromParent,
    removeExternalRegistration,
    copyDistToFolder,
    copyToInternalClipboard,
    cutToInternalClipboard,
    pasteFromInternalClipboard,
    openRenameModal,
    runInstallDependencies,
    onDeletePath,
    openNewFileModal: () =>
      setPathModal({ kind: "newFile", value: "newfile.js" }),
    openNewFolderModal: () =>
      setPathModal({ kind: "newFolder", value: "lib" }),
  };

  useEffect(() => {
    if (!shellLayout) {
      return;
    }
    const detail: IdeShellStateDetail = {
      pluginFolder,
      folders: folders.map((name) => ({
        name,
        fileList: folderFilesCache[name] ?? null,
      })),
      fileList,
      activePath,
      treeSelectionWorkspace,
      treeSelectedPaths,
      busy,
      dirtyTabCount,
      hasActiveTab: !!activeTab,
      tscOnSave,
      formatOnSave,
      reloadOnSave,
    };
    window.dispatchEvent(
      new CustomEvent(IDE_SHELL_STATE_EVENT, { detail }),
    );
  }, [
    shellLayout,
    pluginFolder,
    folders,
    folderFilesCache,
    fileList,
    activePath,
    treeSelectionWorkspace,
    treeSelectedPaths,
    busy,
    dirtyTabCount,
    activeTab,
    tscOnSave,
    formatOnSave,
    reloadOnSave,
  ]);

  useEffect(() => {
    if (!shellLayout) {
      return;
    }
    const onTreeSel = (e: Event) => {
      const d = (e as CustomEvent<{ workspace: string; paths: string[] }>)
        .detail;
      if (d && typeof d.workspace === "string" && Array.isArray(d.paths)) {
        setTreeSelectionWorkspace(d.workspace);
        setTreeSelectedPaths(d.paths);
      }
    };
    const onTreeFs = (e: Event) => {
      const d = (e as CustomEvent<IdeShellTreeFsOpDetail>).detail;
      if (d && typeof d === "object") {
        void runTreeFsOp(d);
      }
    };
    window.addEventListener(IDE_SHELL_TREE_SELECTION_EVENT, onTreeSel);
    window.addEventListener(IDE_SHELL_TREE_FS_OP_EVENT, onTreeFs);
    return () => {
      window.removeEventListener(IDE_SHELL_TREE_SELECTION_EVENT, onTreeSel);
      window.removeEventListener(IDE_SHELL_TREE_FS_OP_EVENT, onTreeFs);
    };
  }, [shellLayout, runTreeFsOp]);

  useEffect(() => {
    if (!shellLayout) {
      return;
    }
    const onExpand = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (typeof name !== "string" || !name) {
        return;
      }
      void (async () => {
        try {
          const files = await window.Nodex.listPluginSourceFiles(name);
          setFolderFilesCache((prev) => ({ ...prev, [name]: files }));
        } catch (err) {
          clientLog({
            component: "PluginIDE",
            level: "warn",
            message: `listPluginSourceFiles(${name}): ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      })();
    };
    window.addEventListener(IDE_SHELL_EXPAND_FOLDER_EVENT, onExpand);
    return () =>
      window.removeEventListener(IDE_SHELL_EXPAND_FOLDER_EVENT, onExpand);
  }, [shellLayout]);

  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;

  useEffect(() => {
    const pend = pendingShellOpenRef.current;
    if (!pluginFolder || pend == null) {
      return;
    }
    pendingShellOpenRef.current = null;
    queueMicrotask(() => {
      void openFileRef.current(pend);
    });
  }, [pluginFolder]);

  useEffect(() => {
    if (!shellLayout) {
      return;
    }
    const onPlugin = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string") {
        setPluginFolder(id);
      }
    };
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<IdeShellOpenFileDetail>).detail;
      if (typeof d === "string") {
        void openFileRef.current(d);
        return;
      }
      if (
        d &&
        typeof d === "object" &&
        typeof d.relativePath === "string" &&
        typeof d.pluginFolder === "string"
      ) {
        if (d.pluginFolder === pluginFolderRef.current) {
          void openFileRef.current(d.relativePath);
        } else {
          pendingShellOpenRef.current = d.relativePath;
          setPluginFolder(d.pluginFolder);
        }
      }
    };
    const onAction = (e: Event) => {
      const detail = (
        e as CustomEvent<{ type: IdeShellAction } & IdeShellActionPayload>
      ).detail;
      const t = detail?.type;
      if (!t) {
        return;
      }
      const d = detail;
      const a = ideActionsRef.current;
      switch (t) {
        case "save":
          void a.saveActive();
          return;
        case "saveAll":
          void a.saveAllDirtyTabs();
          return;
        case "newFile":
          a.openNewFileModal();
          return;
        case "newFolder":
          a.openNewFolderModal();
          return;
        case "importFiles":
          void a.onImportFiles();
          return;
        case "importFolder":
          void a.onImportFolder();
          return;
        case "delete":
          void a.onDeletePath(d.targetPaths, d.targetWorkspace);
          return;
        case "rename": {
          const tw = d.targetWorkspace;
          if (tw && tw !== pluginFolderRef.current) {
            setPluginFolder(tw);
            const p = d.targetPaths?.[0];
            queueMicrotask(() => {
              ideActionsRef.current.openRenameModal(p);
            });
          } else {
            a.openRenameModal(d.targetPaths?.[0]);
          }
          return;
        }
        case "copy":
          void a.copyToInternalClipboard(
            d.targetPaths?.length || d.targetWorkspace
              ? {
                  paths: d.targetPaths,
                  sourceWorkspace: d.targetWorkspace,
                }
              : undefined,
          );
          return;
        case "cut":
          void a.cutToInternalClipboard(
            d.targetPaths?.length || d.targetWorkspace
              ? {
                  paths: d.targetPaths,
                  sourceWorkspace: d.targetWorkspace,
                }
              : undefined,
          );
          return;
        case "paste":
          void a.pasteFromInternalClipboard(d.pasteIntoDir);
          return;
        case "copyDist":
          void a.copyDistToFolder();
          return;
        case "bundle":
          void a.bundleLocalOnly();
          return;
        case "bundleReload":
          void a.bundleAndReload();
          return;
        case "reloadRegistry":
          void a.reloadOnly();
          return;
        case "typecheck":
          void a.runTypecheck();
          return;
        case "toggleTscOnSave":
          setTscOnSave((v) => {
            const n = !v;
            if (n) {
              localStorage.setItem(PLUGIN_IDE_TSC_ON_SAVE_KEY, "1");
            } else {
              localStorage.removeItem(PLUGIN_IDE_TSC_ON_SAVE_KEY);
            }
            return n;
          });
          return;
        case "toggleFormatOnSave":
          setFormatOnSave((v) => {
            const n = !v;
            if (n) {
              localStorage.setItem(PLUGIN_IDE_FORMAT_ON_SAVE_KEY, "1");
            } else {
              localStorage.removeItem(PLUGIN_IDE_FORMAT_ON_SAVE_KEY);
            }
            return n;
          });
          return;
        case "toggleReloadOnSave":
          setReloadOnSave((v) => {
            const n = !v;
            if (n) {
              localStorage.setItem(PLUGIN_IDE_RELOAD_ON_SAVE_KEY, "1");
            } else {
              localStorage.removeItem(PLUGIN_IDE_RELOAD_ON_SAVE_KEY);
            }
            return n;
          });
          return;
        case "installDeps":
          void a.runInstallDependencies();
          return;
        case "loadParent":
          void a.loadNodexFromParent();
          return;
        case "removeExternal":
          void a.removeExternalRegistration();
          return;
        default:
          return;
      }
    };
    window.addEventListener(IDE_SHELL_PLUGIN_EVENT, onPlugin);
    window.addEventListener(IDE_SHELL_OPEN_FILE_EVENT, onOpen);
    window.addEventListener(IDE_SHELL_ACTION_EVENT, onAction);
    return () => {
      window.removeEventListener(IDE_SHELL_PLUGIN_EVENT, onPlugin);
      window.removeEventListener(IDE_SHELL_OPEN_FILE_EVENT, onOpen);
      window.removeEventListener(IDE_SHELL_ACTION_EVENT, onAction);
    };
  }, [shellLayout]);

  useEffect(() => {
    const shortcutSurfaceOk = (ev: KeyboardEvent): boolean => {
      const t = ev.target;
      if (!(t instanceof HTMLElement)) {
        return true;
      }
      if (t.closest(".monaco-editor")) {
        return true;
      }
      const tag = t.tagName;
      return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
    };

    const onKey = (ev: KeyboardEvent) => {
      const a = ideActionsRef.current;
      if (ev.key === "F2") {
        if (!shortcutSurfaceOk(ev)) {
          return;
        }
        ev.preventDefault();
        a.openRenameModal();
        return;
      }
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key.toLowerCase() === "s") {
        ev.preventDefault();
        if (ev.shiftKey) {
          void a.saveAllDirtyTabs();
        } else {
          void a.saveActive();
        }
        return;
      }
      if (!mod || !ev.shiftKey) {
        return;
      }
      if (!shortcutSurfaceOk(ev)) {
        return;
      }
      const k = ev.key.toLowerCase();
      const stop = (): void => {
        ev.preventDefault();
        ev.stopPropagation();
      };
      if (k === "t") {
        stop();
        void a.runTypecheck();
      } else if (k === "b") {
        stop();
        void a.bundleLocalOnly();
      } else if (k === "l") {
        stop();
        void a.reloadOnly();
      } else if (k === "e") {
        stop();
        void a.bundleAndReload();
      } else if (k === "o") {
        stop();
        void a.onImportFiles();
      } else if (k === "n") {
        stop();
        a.openNewFileModal();
      } else if (k === "p") {
        stop();
        void a.loadNodexFromParent();
      } else if (k === "d") {
        stop();
        void a.copyDistToFolder();
      } else if (k === "c") {
        stop();
        void a.copyToInternalClipboard();
      } else if (k === "x") {
        stop();
        void a.cutToInternalClipboard();
      } else if (k === "v") {
        stop();
        void a.pasteFromInternalClipboard();
      } else if (k === "m") {
        stop();
        a.openRenameModal();
      } else if (k === "i") {
        stop();
        void a.runInstallDependencies();
      } else if (k === "delete" || k === "backspace") {
        stop();
        void a.onDeletePath();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const qLower = npmQuery.trim().toLowerCase();
  const filteredInstalled = useMemo(() => {
    if (qLower.length < 2) {
      return installedPkgs.slice(0, 15);
    }
    return installedPkgs.filter((p) => p.name.toLowerCase().includes(qLower));
  }, [installedPkgs, qLower]);

  const toggleFilesPanel = () => {
    const p = filesPanelRef.current;
    if (!p) {
      return;
    }
    if (p.isCollapsed()) {
      p.expand();
      localStorage.removeItem(PLUGIN_IDE_FILES_COLLAPSED_KEY);
    } else {
      p.collapse();
      localStorage.setItem(PLUGIN_IDE_FILES_COLLAPSED_KEY, "1");
    }
  };

  const depsToolbarInner = (
    <>
      <span className="text-[12px] font-semibold text-foreground">
        Dependencies
      </span>
      <div
        ref={npmWrapRef}
        className="relative isolate z-0 flex-1 min-w-[14rem] max-w-xl"
      >
        <input
          type="search"
          className="w-full rounded-sm border border-input bg-background px-3 py-2 text-[12px]"
          placeholder="Search npm (2+ chars) or installed packages…"
          value={npmQuery}
          onChange={(e) => setNpmQuery(e.target.value)}
          onFocus={() => setNpmMenuOpen(true)}
          disabled={!pluginFolder || busy}
        />
        {npmMenuOpen && pluginFolder && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-background shadow-xl text-sm">
            {filteredInstalled.length > 0 && (
              <div className="p-2 border-b border-border bg-background">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                  Installed
                </div>
                <ul>
                  {filteredInstalled.map((p) => (
                    <li
                      key={`${p.name}-${p.dev ? "d" : "p"}`}
                      className="px-2 py-1 text-foreground font-mono text-xs"
                    >
                      {p.name}
                      <span className="text-muted-foreground">
                        @{p.range}
                        {p.dev ? " (dev)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {npmQuery.trim().length >= 2 && (
              <div className="p-2 bg-background">
                <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">
                  npm registry
                </div>
                {npmLoading ? (
                  <div className="text-muted-foreground text-xs px-2 py-2">
                    Searching…
                  </div>
                ) : npmResults.length === 0 ? (
                  <div className="text-muted-foreground text-xs px-2 py-2">
                    No results
                  </div>
                ) : (
                  <ul>
                    {npmResults.map((r) => (
                      <li key={r.name}>
                        <button
                          type="button"
                          className="flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left hover:bg-accent/50"
                          onClick={() => void addRegistryDependency(r)}
                          disabled={busy}
                        >
                          <span className="font-mono text-foreground">
                            {r.name}
                            <span className="text-muted-foreground font-normal">
                              @{r.version}
                            </span>
                          </span>
                          {r.description ? (
                            <span className="text-xs text-muted-foreground line-clamp-2">
                              {r.description}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={addAsDevDep}
          onChange={(e) => setAddAsDevDep(e.target.checked)}
          className="h-3.5 w-3.5 rounded-sm border-border"
        />
        devDependency
      </label>
      <button
        type="button"
        disabled={!pluginFolder || busy}
        onClick={() => void runInstallDependencies()}
        title="Install dependencies (⇧I)"
        className="min-h-8 shrink-0 rounded-sm border border-foreground bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background shadow-sm transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        Install dependencies
      </button>
      <button
        type="button"
        disabled={!pluginFolder || busy}
        onClick={() => void bundleAndReload()}
        title="Bundle workspace and reload registry (⇧E)"
        className="min-h-8 shrink-0 rounded-sm border border-foreground bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background shadow-sm transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        Build &amp; load
      </button>
    </>
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {!shellLayout ? (
      <header className="relative z-40 shrink-0 border-b border-border bg-background">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
            Plugin
            <select
              className="max-w-[14rem] rounded-sm border border-input bg-background px-2.5 py-1.5 text-[12px] shadow-sm"
              value={pluginFolder}
              onChange={(e) => {
                setPluginFolder(e.target.value);
              }}
            >
              <option value="">—</option>
              {folders.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <div
            ref={toolbarMenuRef}
            className="flex flex-wrap items-center gap-1"
          >
            <div className="relative">
              <button
                type="button"
                className="min-h-7 rounded-sm border border-input bg-background px-2.5 py-1 text-[12px] text-foreground hover:bg-muted/50"
                aria-expanded={toolbarMenu === "file"}
                aria-haspopup="true"
                onClick={() =>
                  setToolbarMenu((m) => (m === "file" ? null : "file"))
                }
              >
                File
              </button>
              {toolbarMenu === "file" ? (
                <div
                  className={PLUGIN_IDE_TOOLBAR_MENU_PANEL}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!activeTab || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void saveActive();
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy || dirtyTabCount === 0}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void saveAllDirtyTabs();
                    }}
                  >
                    Save all
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      setPathModal({ kind: "newFile", value: "newfile.js" });
                    }}
                  >
                    New file
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      setPathModal({ kind: "newFolder", value: "lib" });
                    }}
                  >
                    New folder
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void onImportFiles();
                    }}
                  >
                    Import file(s)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void onImportFolder();
                    }}
                  >
                    Import folder
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || !activePath || busy}
                    className="w-full text-left px-3 py-2 text-sm text-red-800 hover:bg-red-50 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void onDeletePath();
                    }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || !activePath || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      openRenameModal();
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || !activePath || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void copyToInternalClipboard();
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || !activePath || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void cutToInternalClipboard();
                    }}
                  >
                    Cut
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void pasteFromInternalClipboard();
                    }}
                  >
                    Paste
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    title="Copy dist/ contents via folder picker"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void copyDistToFolder();
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
                className="min-h-7 rounded-sm border border-input bg-background px-2.5 py-1 text-[12px] text-foreground hover:bg-muted/50"
                aria-expanded={toolbarMenu === "edit"}
                aria-haspopup="true"
                onClick={() =>
                  setToolbarMenu((m) => (m === "edit" ? null : "edit"))
                }
              >
                Edit
              </button>
              {toolbarMenu === "edit" ? (
                <div
                  className={PLUGIN_IDE_TOOLBAR_MENU_PANEL}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void runTypecheck();
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
                    aria-checked={tscOnSave}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                    onClick={() => {
                      setToolbarMenu(null);
                      const v = !tscOnSave;
                      setTscOnSave(v);
                      if (v) {
                        localStorage.setItem(PLUGIN_IDE_TSC_ON_SAVE_KEY, "1");
                      } else {
                        localStorage.removeItem(PLUGIN_IDE_TSC_ON_SAVE_KEY);
                      }
                    }}
                  >
                    {tscOnSave ? "✓ " : ""}
                    Typecheck on save
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={formatOnSave}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                    onClick={() => {
                      setToolbarMenu(null);
                      const v = !formatOnSave;
                      setFormatOnSave(v);
                      if (v) {
                        localStorage.setItem(
                          PLUGIN_IDE_FORMAT_ON_SAVE_KEY,
                          "1",
                        );
                      } else {
                        localStorage.removeItem(PLUGIN_IDE_FORMAT_ON_SAVE_KEY);
                      }
                    }}
                  >
                    {formatOnSave ? "✓ " : ""}
                    Format on save (Prettier)
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={reloadOnSave}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40"
                    onClick={() => {
                      setToolbarMenu(null);
                      const v = !reloadOnSave;
                      setReloadOnSave(v);
                      if (v) {
                        localStorage.setItem(
                          PLUGIN_IDE_RELOAD_ON_SAVE_KEY,
                          "1",
                        );
                      } else {
                        localStorage.removeItem(PLUGIN_IDE_RELOAD_ON_SAVE_KEY);
                      }
                    }}
                  >
                    {reloadOnSave ? "✓ " : ""}
                    Reload registry on save
                  </button>
                </div>
              ) : null}
            </div>
            <div className="relative">
              <button
                type="button"
                className="min-h-7 rounded-sm border border-input bg-background px-2.5 py-1 text-[12px] text-foreground hover:bg-muted/50"
                aria-expanded={toolbarMenu === "build"}
                aria-haspopup="true"
                onClick={() =>
                  setToolbarMenu((m) => (m === "build" ? null : "build"))
                }
              >
                Build
              </button>
              {toolbarMenu === "build" ? (
                <div
                  className={PLUGIN_IDE_TOOLBAR_MENU_PANEL}
                  role="menu"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    title="Pick parent folder; register subfolders with .nodexplugin"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void loadNodexFromParent();
                    }}
                  >
                    Load parent (.nodexplugin)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    title="Remove external registration only (sources/ plugins are unchanged)"
                    className="w-full text-left px-3 py-2 text-sm text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void removeExternalRegistration();
                    }}
                  >
                    Remove external
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void bundleLocalOnly();
                    }}
                  >
                    Bundle
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!pluginFolder || busy}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent/80 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void bundleAndReload();
                    }}
                  >
                    Bundle &amp; reload
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={busy}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted/40 disabled:opacity-50"
                    onClick={() => {
                      setToolbarMenu(null);
                      void reloadOnly();
                    }}
                  >
                    Reload registry
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {workspaceToolsControls}
          </div>
        </div>
      </header>
      ) : null}

      {shellLayout ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Plugin IDE
          </span>
          {workspaceToolsControls}
        </div>
      ) : null}

      <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border bg-muted/30 px-4 py-3">
        {depsToolbarInner}
      </div>

      {diskConflictPath && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div
            className="bg-background rounded-lg shadow-xl max-w-md w-full p-5 border border-amber-500/40"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disk-conflict-title"
          >
            <h3
              id="disk-conflict-title"
              className="text-lg font-semibold text-foreground mb-2"
            >
              File changed on disk
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              <code className="text-xs font-mono bg-muted px-1">
                {diskConflictPath}
              </code>{" "}
              was modified outside the editor while you have unsaved changes.
            </p>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded bg-muted text-foreground hover:bg-muted"
                disabled={busy}
                onClick={() => void resolveDiskConflictKeepMine()}
              >
                Keep mine
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:opacity-90 disabled:opacity-50"
                disabled={busy}
                onClick={() => void resolveDiskConflictReload()}
              >
                Reload from disk
              </button>
            </div>
          </div>
        </div>
      )}

      {pathModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            className="bg-background rounded-lg shadow-xl max-w-md w-full p-5 border border-border"
            role="dialog"
            aria-modal="true"
            aria-labelledby="path-modal-title"
          >
            <h3
              id="path-modal-title"
              className="text-lg font-semibold text-foreground mb-2"
            >
              {pathModal.kind === "newFile"
                ? "New file"
                : pathModal.kind === "newFolder"
                  ? "New folder"
                  : "Rename"}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {pathModal.kind === "rename"
                ? "New path relative to plugin root."
                : (
                    <>
                      Path relative to plugin root (use{" "}
                      <code className="text-xs bg-muted px-1">/</code> for
                      subfolders).
                    </>
                  )}
            </p>
            <input
              type="text"
              className="w-full border border-input rounded px-2 py-2 text-sm font-mono mb-4"
              value={pathModal.value}
              onChange={(e) =>
                setPathModal({
                  ...pathModal,
                  value: e.target.value,
                })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitPathModal();
                }
              }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded bg-muted text-foreground hover:bg-muted"
                onClick={() => setPathModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nodex-primary-fill rounded px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
                style={{
                  backgroundColor: "hsl(var(--primary))",
                  color: "hsl(var(--primary-foreground))",
                }}
                disabled={busy}
                onClick={() => void submitPathModal()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {tscDiagnostics.length > 0 && (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-border bg-rose-50/50 px-4 py-3 text-[11px] dark:bg-rose-950/20">
          <div className="mb-2 font-semibold text-foreground">
            Problems ({tscDiagnostics.length})
          </div>
          <ul className="space-y-1 text-foreground">
            {tscDiagnostics.map((d, i) => (
              <li key={`${d.relativePath}-${d.line}-${d.column}-${i}`}>
                <button
                  type="button"
                  className="text-left w-full hover:underline break-words"
                  onClick={() => void openFile(d.relativePath)}
                >
                  <span
                    className={
                      d.category === "error"
                        ? "text-red-700 font-medium"
                        : "text-amber-900"
                    }
                  >
                    {d.relativePath}({d.line},{d.column})
                  </span>{" "}
                  {d.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PanelGroup
        direction="horizontal"
        autoSaveId={
          shellLayout ? "plugin-ide-panels-shell" : "plugin-ide-panels"
        }
        className="flex-1 min-h-0"
      >
        {!shellLayout ? (
          <>
            <Panel
              ref={filesPanelRef}
              collapsible
              collapsedSize={0}
              minSize={10}
              defaultSize={18}
              className="min-w-0"
              onCollapse={() =>
                localStorage.setItem(PLUGIN_IDE_FILES_COLLAPSED_KEY, "1")
              }
              onExpand={() =>
                localStorage.removeItem(PLUGIN_IDE_FILES_COLLAPSED_KEY)
              }
            >
              <aside className="flex h-full flex-col overflow-y-auto border-r border-border bg-sidebar">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Files
                  </span>
                  <button
                    type="button"
                    className="rounded-sm p-1.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Collapse or expand file list"
                    aria-label="Toggle file sidebar"
                    onClick={toggleFilesPanel}
                  >
                    ◀▶
                  </button>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                  {fileList.map((f) => (
                    <li key={f}>
                      <button
                        type="button"
                        onClick={() => void openFile(f)}
                        className={`w-full truncate border-l-2 py-[5px] pl-4 pr-3 text-left font-mono text-[13px] leading-snug transition-colors hover:bg-muted/50 ${
                          activePath === f
                            ? "border-primary bg-muted/60 font-medium text-foreground"
                            : "border-transparent text-foreground"
                        }`}
                        title={f}
                      >
                        {f}
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            </Panel>

            <PanelResizeHandle className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />
          </>
        ) : null}

        <Panel
          defaultSize={shellLayout ? 58 : 52}
          minSize={30}
          className="min-w-0"
        >
          <div className="h-full flex flex-col min-h-0">
            <div
              className="flex shrink-0 overflow-x-auto border-b border-border bg-muted/80"
              role="tablist"
            >
              {tabs.map((t) => {
                const dirty = t.content !== t.savedContent;
                const base = t.relativePath.split("/").pop() ?? t.relativePath;
                return (
                  <div
                    key={t.relativePath}
                    title={
                      dirty
                        ? `${t.relativePath} (unsaved)`
                        : t.relativePath
                    }
                    className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap border-r border-border px-3 py-2 font-mono text-[12px] ${
                      activePath === t.relativePath
                        ? "border-b-transparent bg-background text-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}
                    onClick={() => setActivePath(t.relativePath)}
                    role="tab"
                    tabIndex={0}
                    aria-selected={activePath === t.relativePath}
                  >
                    <span>
                      {dirty ? "* " : ""}
                      {base}
                    </span>
                    <button
                      type="button"
                      className="px-1 text-muted-foreground hover:text-destructive"
                      aria-label="Close tab"
                      onClick={(e) => closeTab(t.relativePath, e)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            {dirtyTabCount > 0 ? (
              <div className="shrink-0 border-b border-orange-500/25 bg-orange-500/10 px-4 py-1.5 text-[11px] text-orange-950 dark:border-orange-400/20 dark:bg-orange-400/10 dark:text-orange-50">
                {dirtyTabCount} unsaved file
                {dirtyTabCount === 1 ? "" : "s"}
              </div>
            ) : null}
            <div className="flex-1 min-h-0">
              {activeTab ? (
                <Editor
                  key={`${workspaceRootFileUri}:${activeTab.relativePath}:${monacoTheme}`}
                  height="100%"
                  theme={monacoTheme}
                  path={
                    workspaceRootFileUri
                      ? joinFileUri(
                          workspaceRootFileUri,
                          activeTab.relativePath,
                        )
                      : activeTab.relativePath
                  }
                  language={languageForPath(activeTab.relativePath)}
                  value={activeTab.content}
                  beforeMount={monacoBeforeMount}
                  onMount={handleEditorMount}
                  onChange={(v) => markDirtyFromContent(v)}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    quickSuggestions: true,
                    suggestOnTriggerCharacters: true,
                    acceptSuggestionOnCommitCharacter: true,
                    tabCompletion: "on",
                    parameterHints: { enabled: true },
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Select a plugin and open a file
                </div>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="nodex-panel-sash relative w-1 shrink-0 bg-transparent transition-colors before:absolute before:inset-y-0 before:left-1/2 before:z-10 before:w-px before:-translate-x-1/2 before:bg-border before:transition-colors hover:before:bg-resize-handle-hover data-[panel-resize-handle-active=true]:before:bg-resize-handle-active" />

        <Panel defaultSize={30} minSize={18} className="min-w-0">
          <aside className="flex h-full min-h-0 flex-col border-l border-border bg-sidebar">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Preview note type
                </label>
                <button
                  type="button"
                  className="shrink-0 rounded-sm border border-input bg-background px-2 py-1 text-[10px] hover:bg-muted/50"
                  onClick={() => setPreviewExpanded((x) => !x)}
                >
                  {previewExpanded ? "Restore" : "Maximize"}
                </button>
              </div>
              <select
                className="w-full rounded-sm border border-input bg-background px-2.5 py-2 text-[12px]"
                value={previewType}
                onChange={(e) => setPreviewType(e.target.value)}
              >
                {types.length === 0 ? (
                  <option value="">No types registered</option>
                ) : (
                  types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {previewExpanded &&
              previewNote &&
              types.includes(previewType) ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[11px] text-muted-foreground">
                  <p>Preview is fullscreen over the app.</p>
                  <p className="text-[10px]">Press Escape or Restore to exit.</p>
                </div>
              ) : previewNote && types.includes(previewType) ? (
                <SecurePluginRenderer
                  key={`${pluginFolder}-${previewType}-${previewRev}`}
                  note={previewNote}
                />
              ) : (
                <div className="px-4 py-4 text-[11px] leading-relaxed text-muted-foreground">
                  Reload registry after bundling to register types, then pick a
                  type to preview.
                </div>
              )}
            </div>
          </aside>
        </Panel>
      </PanelGroup>

      {previewExpanded &&
      previewNote &&
      types.includes(previewType) &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[2147483000] flex min-h-0 flex-col bg-background text-foreground shadow-2xl"
              role="dialog"
              aria-label="Plugin preview fullscreen"
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-muted/80 px-4 py-2">
                <span className="text-[12px] font-medium">
                  Preview · {previewType}
                </span>
                <button
                  type="button"
                  className="rounded-sm border border-input bg-background px-3 py-1 text-[11px] hover:bg-muted/50"
                  onClick={() => setPreviewExpanded(false)}
                >
                  Restore
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <SecurePluginRenderer
                  key={`fs-${pluginFolder}-${previewType}-${previewRev}`}
                  note={previewNote}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};

export default PluginIDE;
