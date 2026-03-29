import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  IDE_SHELL_ACTION_EVENT,
  IDE_SHELL_OPEN_FILE_EVENT,
  IDE_SHELL_PLUGIN_EVENT,
  IDE_SHELL_STATE_EVENT,
  type IdeShellAction,
  type IdeShellStateDetail,
} from "../plugin-ide/ideShellBridge";

const PLUGIN_IDE_FILES_COLLAPSED_KEY = "plugin-ide-files-collapsed";
const PLUGIN_IDE_TSC_ON_SAVE_KEY = "plugin-ide-tsc-on-save";
const PLUGIN_IDE_RELOAD_ON_SAVE_KEY = "plugin-ide-reload-on-save";
const PLUGIN_IDE_SNAPSHOT_KEY = "plugin-ide-workspace-snapshot-v1";
const PLUGIN_IDE_MAX_SNAPSHOT_FILE_BYTES = 500 * 1024;
const NPM_DEBOUNCE_MS = 280;

const IDE_SHORTCUT_KBD =
  "inline rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground/90 shadow-sm";

interface OpenTab {
  relativePath: string;
  content: string;
  savedContent: string;
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

  const [folders, setFolders] = useState<string[]>([]);
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
  const [pathModal, setPathModal] = useState<PathModalState>(null);
  const filesPanelRef = useRef<ImperativePanelHandle | null>(null);
  const npmWrapRef = useRef<HTMLDivElement | null>(null);

  const [npmQuery, setNpmQuery] = useState("");
  const [npmResults, setNpmResults] = useState<NpmSearchRow[]>([]);
  const [npmLoading, setNpmLoading] = useState(false);
  const [npmMenuOpen, setNpmMenuOpen] = useState(false);
  const [toolbarMenu, setToolbarMenu] = useState<null | "file" | "build">(null);
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
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const tabsRef = useRef<OpenTab[]>([]);
  const activePathRef = useRef<string | null>(null);
  const cursorByPathRef = useRef<
    Record<string, { lineNumber: number; column: number }>
  >({});
  const prevActivePathForCursorRef = useRef<string | null>(null);
  const reloadAfterSaveTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pathClipboardRef = useRef<{ rel: string; isDir: boolean } | null>(
    null,
  );
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
    } catch (e) {
      setFileList([]);
      setStatus(
        e instanceof Error ? e.message : "Could not list plugin files",
      );
    }
  }, [pluginFolder]);

  const refreshWorkspaceFolders = useCallback(async () => {
    const list = await window.Nodex.listPluginWorkspaceFolders();
    setFolders(list);
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
    });
    return off;
  }, [refreshFileList]);

  useEffect(() => {
    void refreshFileList();
  }, [refreshFileList]);

  useEffect(() => {
    const id = pluginFolder;
    return () => {
      if (id) {
        flushWorkspaceSnapshot(id);
      }
    };
  }, [pluginFolder, flushWorkspaceSnapshot]);

  useEffect(() => {
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
      return;
    }
    setTabs(snap.tabs);
    const ap =
      snap.activePath &&
      snap.tabs.some((t) => t.relativePath === snap.activePath)
        ? snap.activePath
        : (snap.tabs[0]?.relativePath ?? null);
    setActivePath(ap);
    cursorByPathRef.current = { ...snap.cursors };
    prevActivePathForCursorRef.current = ap;
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
      setTabs((prev) => [
        ...prev,
        { relativePath, content, savedContent: content },
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

  const saveActive = async (): Promise<boolean> => {
    if (!pluginFolder || !activeTab) {
      return true;
    }
    if (activeTab.content === activeTab.savedContent) {
      return true;
    }
    const res = await window.Nodex.writePluginSourceFile(
      pluginFolder,
      activeTab.relativePath,
      activeTab.content,
    );
    if (!res.success) {
      setStatus(res.error ?? "Save failed");
      return false;
    }
    setTabs((prev) =>
      prev.map((t) =>
        t.relativePath === activeTab.relativePath
          ? { ...t, savedContent: t.content }
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
        const res = await window.Nodex.writePluginSourceFile(
          pluginFolder,
          t.relativePath,
          t.content,
        );
        if (!res.success) {
          setStatus(res.error ?? `Save failed: ${t.relativePath}`);
          return false;
        }
      }
      setTabs((prev) =>
        prev.map((t) =>
          t.content !== t.savedContent ? { ...t, savedContent: t.content } : t,
        ),
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
        setStatus(res.error);
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
        setTabs((prev) =>
          prev.map((t) =>
            t.relativePath === pathModal.from
              ? { ...t, relativePath: toRel }
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

  const copyToInternalClipboard = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    if (!activePath) {
      setStatus("Open a file to copy.");
      return;
    }
    setBusy(true);
    try {
      const kind = await window.Nodex.getPluginSourceEntryKind(
        pluginFolder,
        activePath,
      );
      if (kind === "missing") {
        setStatus("Cannot copy: path not found.");
        return;
      }
      pathClipboardRef.current = {
        rel: activePath,
        isDir: kind === "dir",
      };
      setStatus(
        `Copied ${activePath} (${kind === "dir" ? "folder" : "file"}) — use Paste to duplicate.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const pasteFromInternalClipboard = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    const clip = pathClipboardRef.current;
    if (!clip) {
      setStatus("Nothing to paste (Copy first).");
      return;
    }
    setBusy(true);
    try {
      let destRel = siblingCopyRelativePath(clip.rel, clip.isDir);
      let attempt = 0;
      let res = await window.Nodex.copyPluginSourceWithinWorkspace(
        pluginFolder,
        clip.rel,
        destRel,
      );
      while (!res.success && attempt < 12) {
        attempt += 1;
        destRel = siblingCopyRelativePath(destRel, clip.isDir);
        res = await window.Nodex.copyPluginSourceWithinWorkspace(
          pluginFolder,
          clip.rel,
          destRel,
        );
      }
      if (!res.success) {
        setStatus(res.error ?? "Paste failed");
        return;
      }
      await refreshFileList();
      if (!clip.isDir) {
        await openFile(destRel);
      }
      setStatus(`Duplicated to ${destRel}`);
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

  const openRenameModal = () => {
    if (!pluginFolder || !activePath) {
      setStatus("Open a file to rename.");
      return;
    }
    setPathModal({ kind: "rename", from: activePath, value: activePath });
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

  const onDeletePath = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    const target = activePath;
    if (!target) {
      setStatus("Select a file in the list (open it) to delete.");
      return;
    }
    if (!confirm(`Delete “${target}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.Nodex.deletePluginSourcePath(
        pluginFolder,
        target,
      );
      if (!res.success) {
        setStatus(res.error ?? "Delete failed");
        return;
      }
      const nextTabs = tabs.filter((t) => t.relativePath !== target);
      setTabs(nextTabs);
      setActivePath(
        activePath === target
          ? (nextTabs[0]?.relativePath ?? null)
          : activePath,
      );
      await refreshFileList();
      setStatus(`Deleted ${target}`);
    } finally {
      setBusy(false);
    }
  };

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
      fileList,
      activePath,
      busy,
      dirtyTabCount,
      hasActiveTab: !!activeTab,
    };
    window.dispatchEvent(
      new CustomEvent(IDE_SHELL_STATE_EVENT, { detail }),
    );
  }, [
    shellLayout,
    pluginFolder,
    fileList,
    activePath,
    busy,
    dirtyTabCount,
    activeTab,
  ]);

  const openFileRef = useRef(openFile);
  openFileRef.current = openFile;

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
      const rel = (e as CustomEvent<string>).detail;
      if (typeof rel === "string") {
        void openFileRef.current(rel);
      }
    };
    const onAction = (e: Event) => {
      const t = (e as CustomEvent<{ type: IdeShellAction }>).detail?.type;
      if (!t) {
        return;
      }
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
          void a.onDeletePath();
          return;
        case "rename":
          a.openRenameModal();
          return;
        case "copy":
          void a.copyToInternalClipboard();
          return;
        case "paste":
          void a.pasteFromInternalClipboard();
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
        onClick={() => void runTypecheck()}
        className="min-h-7 rounded-sm border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted/60 disabled:opacity-50"
      >
        Check types
      </button>
      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={tscOnSave}
          onChange={(e) => {
            const v = e.target.checked;
            setTscOnSave(v);
            if (v) {
              localStorage.setItem(PLUGIN_IDE_TSC_ON_SAVE_KEY, "1");
            } else {
              localStorage.removeItem(PLUGIN_IDE_TSC_ON_SAVE_KEY);
            }
          }}
          className="h-3.5 w-3.5 rounded-sm border-border"
        />
        Typecheck on save
      </label>
      <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={reloadOnSave}
          onChange={(e) => {
            const v = e.target.checked;
            setReloadOnSave(v);
            if (v) {
              localStorage.setItem(PLUGIN_IDE_RELOAD_ON_SAVE_KEY, "1");
            } else {
              localStorage.removeItem(PLUGIN_IDE_RELOAD_ON_SAVE_KEY);
            }
          }}
          className="h-3.5 w-3.5 rounded-sm border-border"
        />
        Reload registry on save
      </label>
      <button
        type="button"
        disabled={!pluginFolder || busy}
        onClick={() => void runInstallDependencies()}
        className="nodex-primary-fill min-h-7 rounded-sm border-0 px-3 py-1.5 text-[12px] font-medium shadow-sm transition-opacity hover:opacity-92 disabled:opacity-50"
        style={{
          backgroundColor: "hsl(var(--primary))",
          color: "hsl(var(--primary-foreground))",
        }}
      >
        Install dependencies
      </button>
    </>
  );

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="relative z-40 shrink-0 border-b border-border bg-background">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          {!shellLayout ? (
            <h2 className="mr-1 text-[13px] font-semibold text-foreground">
              Plugin IDE
            </h2>
          ) : (
            <span className="mr-1 text-[11px] font-medium text-muted-foreground">
              Workspace
            </span>
          )}
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
          {!shellLayout ? (
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
                  className="absolute left-0 top-full z-50 mt-1 min-w-[12rem] rounded-md border border-border bg-background py-1 shadow-lg"
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
                  className="absolute left-0 top-full z-50 mt-1 min-w-[13rem] rounded-md border border-border bg-background py-1 shadow-lg"
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
          ) : null}
        </div>
        <details className="group border-t border-border/80 bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <span className="inline-block w-3 text-center text-muted-foreground/70 transition-transform group-open:rotate-90">
              ›
            </span>
            Keyboard shortcuts
          </summary>
          <div className="border-t border-border/70 px-4 py-3">
            <ul className="grid grid-cols-1 gap-x-10 gap-y-2 text-[11px] text-muted-foreground sm:grid-cols-2">
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⌘/Ctrl+S</kbd> Save
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⌘/Ctrl+⇧S</kbd> Save all
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧T</kbd> Types
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧B</kbd> Bundle
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧L</kbd> Reload registry
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧E</kbd> Bundle + reload
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧O</kbd> Import
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧N</kbd> New file
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧P</kbd> Parent folder
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧D</kbd> Copy dist
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧C</kbd> /{" "}
                <kbd className={IDE_SHORTCUT_KBD}>⇧V</kbd> Copy / paste path
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧M</kbd> /{" "}
                <kbd className={IDE_SHORTCUT_KBD}>F2</kbd> Rename
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧I</kbd> npm install
              </li>
              <li>
                <kbd className={IDE_SHORTCUT_KBD}>⇧⌫</kbd> Delete
              </li>
            </ul>
          </div>
        </details>
      </header>

      {shellLayout ? (
        <details className="group shrink-0 border-b border-border bg-muted/30 [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-[11px] font-medium text-muted-foreground hover:text-foreground">
            <span className="inline-block w-3 text-center text-muted-foreground/70 transition-transform group-open:rotate-90">
              ›
            </span>
            Dependencies and npm (expand)
          </summary>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-border/70 px-4 pb-3 pt-2">
            {depsToolbarInner}
          </div>
        </details>
      ) : (
        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2.5 border-b border-border bg-muted/30 px-4 py-3">
          {depsToolbarInner}
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

      {status && (
        <div className="px-4 py-1 text-sm bg-amber-50 text-amber-900 border-b border-amber-100 shrink-0">
          {status}
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
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Preview note type
              </label>
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
              {previewNote && types.includes(previewType) ? (
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
    </div>
  );
};

export default PluginIDE;
