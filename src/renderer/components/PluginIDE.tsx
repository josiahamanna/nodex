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
import SecurePluginRenderer from "./renderers/SecurePluginRenderer";

const PLUGIN_IDE_FILES_COLLAPSED_KEY = "plugin-ide-files-collapsed";
const PLUGIN_IDE_TSC_ON_SAVE_KEY = "plugin-ide-tsc-on-save";
const NPM_DEBOUNCE_MS = 280;

interface OpenTab {
  relativePath: string;
  content: string;
  savedContent: string;
}

interface PluginIDEProps {
  onPluginsChanged?: () => void;
}

type PathModalState =
  | null
  | { kind: "newFile"; value: string }
  | { kind: "newFolder"; value: string };

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

const PluginIDE: React.FC<PluginIDEProps> = ({ onPluginsChanged }) => {
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
  const [addAsDevDep, setAddAsDevDep] = useState(false);
  const [installedPkgs, setInstalledPkgs] = useState<InstalledPkg[]>([]);
  const [tscDiagnostics, setTscDiagnostics] = useState<TscDiagnostic[]>([]);
  const [tscOnSave, setTscOnSave] = useState(
    () => localStorage.getItem(PLUGIN_IDE_TSC_ON_SAVE_KEY) === "1",
  );
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const ideTypingsLoadedRef = useRef(false);
  const pluginDepTypingsDisposablesRef = useRef<{ dispose: () => void }[]>(
    [],
  );

  const activeTab = useMemo(
    () => tabs.find((t) => t.relativePath === activePath) ?? null,
    [tabs, activePath],
  );

  const refreshTypes = useCallback(async () => {
    const t = await window.Nodex.getRegisteredTypes();
    setTypes(t);
    setPreviewType((cur) => (t.includes(cur) ? cur : t[0] ?? ""));
  }, []);

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

  useEffect(() => {
    void (async () => {
      const list = await window.Nodex.listPluginWorkspaceFolders();
      setFolders(list);
      setPluginFolder((cur) =>
        list.includes(cur) ? cur : list[0] ?? "",
      );
    })();
    void refreshTypes();
  }, [refreshTypes]);

  useEffect(() => {
    void refreshFileList();
  }, [refreshFileList]);

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
    const collapsed = localStorage.getItem(PLUGIN_IDE_FILES_COLLAPSED_KEY) === "1";
    const id = window.setTimeout(() => {
      if (collapsed) {
        filesPanelRef.current?.collapse();
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

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
    return true;
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
      setStatus("Bundled and registry reloaded.");
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
      if (pathModal.kind === "newFile") {
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
      setStatus(`Imported ${res.imported?.length ?? 0} file(s).`);
    } finally {
      setBusy(false);
    }
  };

  const onImportFolder = async () => {
    if (!pluginFolder || busy) {
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const dir = await window.Nodex.selectImportDirectory();
      if (!dir) {
        return;
      }
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
      setStatus(`Imported ${res.imported?.length ?? 0} file(s) from folder.`);
    } finally {
      setBusy(false);
    }
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

  const saveActiveRef = useRef(saveActive);
  saveActiveRef.current = saveActive;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key === "s") {
        ev.preventDefault();
        saveActiveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  return (
    <div className="h-full flex flex-col bg-white">
      <header className="border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-2 shrink-0">
        <h2 className="text-lg font-semibold text-gray-800 mr-2">
          Plugin IDE
        </h2>
        <label className="text-sm text-gray-600 flex items-center gap-1">
          Plugin
          <select
            className="border border-gray-300 rounded px-2 py-1 text-sm max-w-[12rem]"
            value={pluginFolder}
            onChange={(e) => {
              setPluginFolder(e.target.value);
              setTabs([]);
              setActivePath(null);
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
        <button
          type="button"
          disabled={!activeTab || busy}
          onClick={() => saveActive()}
          className="px-3 py-1 text-sm bg-slate-700 text-white rounded hover:bg-slate-800 disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={() =>
            setPathModal({ kind: "newFile", value: "newfile.js" })
          }
          className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-800 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          New file
        </button>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={() => setPathModal({ kind: "newFolder", value: "lib" })}
          className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-800 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          New folder
        </button>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={() => void onImportFiles()}
          className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-800 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Import file(s)
        </button>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={() => void onImportFolder()}
          className="px-3 py-1 text-sm bg-white border border-gray-300 text-gray-800 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Import folder
        </button>
        <button
          type="button"
          disabled={!pluginFolder || !activePath || busy}
          onClick={() => void onDeletePath()}
          className="px-3 py-1 text-sm bg-white border border-red-200 text-red-800 rounded hover:bg-red-50 disabled:opacity-50"
        >
          Delete
        </button>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={bundleAndReload}
          className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          Bundle &amp; reload
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={reloadOnly}
          className="px-3 py-1 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50"
        >
          Reload registry
        </button>
        <span className="text-xs text-gray-500 ml-auto">
          Ctrl+S save · JSX in .jsx · Excludes node_modules, dist, .git, bin
        </span>
      </header>

      <div className="border-b border-gray-200 px-4 py-2 flex flex-wrap items-center gap-3 shrink-0 bg-gray-50/80">
        <span className="text-sm font-medium text-gray-700">Dependencies</span>
        <div ref={npmWrapRef} className="relative flex-1 min-w-[14rem] max-w-xl">
          <input
            type="search"
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            placeholder="Search npm (2+ chars) or installed packages…"
            value={npmQuery}
            onChange={(e) => setNpmQuery(e.target.value)}
            onFocus={() => setNpmMenuOpen(true)}
            disabled={!pluginFolder || busy}
          />
          {npmMenuOpen && pluginFolder && (
            <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg text-sm">
              {filteredInstalled.length > 0 && (
                <div className="p-2 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    Installed
                  </div>
                  <ul>
                    {filteredInstalled.map((p) => (
                      <li
                        key={`${p.name}-${p.dev ? "d" : "p"}`}
                        className="px-2 py-1 text-gray-800 font-mono text-xs"
                      >
                        {p.name}
                        <span className="text-gray-500">
                          @{p.range}
                          {p.dev ? " (dev)" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {npmQuery.trim().length >= 2 && (
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                    npm registry
                  </div>
                  {npmLoading ? (
                    <div className="text-gray-500 text-xs px-2 py-2">
                      Searching…
                    </div>
                  ) : npmResults.length === 0 ? (
                    <div className="text-gray-500 text-xs px-2 py-2">
                      No results
                    </div>
                  ) : (
                    <ul>
                      {npmResults.map((r) => (
                        <li key={r.name}>
                          <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 rounded hover:bg-indigo-50 flex flex-col gap-0.5"
                            onClick={() => void addRegistryDependency(r)}
                            disabled={busy}
                          >
                            <span className="font-mono text-gray-900">
                              {r.name}
                              <span className="text-gray-500 font-normal">
                                @{r.version}
                              </span>
                            </span>
                            {r.description ? (
                              <span className="text-xs text-gray-600 line-clamp-2">
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
        <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={addAsDevDep}
            onChange={(e) => setAddAsDevDep(e.target.checked)}
          />
          devDependency
        </label>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={() => void runTypecheck()}
          className="px-3 py-1 text-sm bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50"
        >
          Check types
        </button>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
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
          />
          Typecheck on save
        </label>
        <button
          type="button"
          disabled={!pluginFolder || busy}
          onClick={() => void runInstallDependencies()}
          className="px-3 py-1 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
        >
          Install dependencies
        </button>
      </div>

      {pathModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 border border-gray-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="path-modal-title"
          >
            <h3
              id="path-modal-title"
              className="text-lg font-semibold text-gray-900 mb-2"
            >
              {pathModal.kind === "newFile" ? "New file" : "New folder"}
            </h3>
            <p className="text-sm text-gray-600 mb-3">
              Path relative to plugin root (use{" "}
              <code className="text-xs bg-gray-100 px-1">/</code> for
              subfolders).
            </p>
            <input
              type="text"
              className="w-full border border-gray-300 rounded px-2 py-2 text-sm font-mono mb-4"
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
                className="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-800 hover:bg-gray-200"
                onClick={() => setPathModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
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
        <div className="px-4 py-2 text-xs border-b border-gray-200 bg-rose-50/50 max-h-36 overflow-y-auto shrink-0">
          <div className="font-semibold text-gray-700 mb-1">
            Problems ({tscDiagnostics.length})
          </div>
          <ul className="space-y-0.5 text-gray-800">
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
        autoSaveId="plugin-ide-panels"
        className="flex-1 min-h-0"
      >
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
          <aside className="h-full border-r border-gray-200 overflow-y-auto bg-gray-50 flex flex-col">
            <div className="p-2 flex items-center justify-between gap-1 shrink-0 border-b border-gray-200/80">
              <span className="text-xs font-medium text-gray-500 uppercase">
                Files
              </span>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-200 text-xs"
                title="Collapse or expand file list"
                aria-label="Toggle file sidebar"
                onClick={toggleFilesPanel}
              >
                ◀▶
              </button>
            </div>
            <ul className="text-sm flex-1 min-h-0 overflow-y-auto">
              {fileList.map((f) => (
                <li key={f}>
                  <button
                    type="button"
                    onClick={() => void openFile(f)}
                    className={`w-full text-left px-2 py-1.5 truncate hover:bg-white ${
                      activePath === f
                        ? "bg-white font-medium text-indigo-800"
                        : "text-gray-700"
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

        <PanelResizeHandle className="w-1.5 bg-gray-200 hover:bg-indigo-300 data-[panel-resize-handle-active]:bg-indigo-400 shrink-0 transition-colors" />

        <Panel defaultSize={52} minSize={30} className="min-w-0">
          <div className="h-full flex flex-col min-h-0">
            <div
              className="flex border-b border-gray-200 overflow-x-auto shrink-0 bg-gray-100"
              role="tablist"
            >
              {tabs.map((t) => {
                const dirty = t.content !== t.savedContent;
                return (
                  <div
                    key={t.relativePath}
                    className={`flex items-center gap-1 px-2 py-1 border-r border-gray-200 text-sm cursor-pointer whitespace-nowrap ${
                      activePath === t.relativePath
                        ? "bg-white text-gray-900"
                        : "bg-gray-100 text-gray-600"
                    }`}
                    onClick={() => setActivePath(t.relativePath)}
                    role="tab"
                    tabIndex={0}
                    aria-selected={activePath === t.relativePath}
                  >
                    <span>
                      {dirty ? "● " : ""}
                      {t.relativePath.split("/").pop()}
                    </span>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-600 px-1"
                      aria-label="Close tab"
                      onClick={(e) => closeTab(t.relativePath, e)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex-1 min-h-0">
              {activeTab ? (
                <Editor
                  key={`${workspaceRootFileUri}:${activeTab.relativePath}`}
                  height="100%"
                  theme="vs-light"
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
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  Select a plugin and open a file
                </div>
              )}
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-1.5 bg-gray-200 hover:bg-indigo-300 data-[panel-resize-handle-active]:bg-indigo-400 shrink-0 transition-colors" />

        <Panel defaultSize={30} minSize={18} className="min-w-0">
          <aside className="h-full border-l border-gray-200 flex flex-col min-h-0 bg-gray-50">
            <div className="p-2 border-b border-gray-200 shrink-0">
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Preview note type
              </label>
              <select
                className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
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
                <div className="p-4 text-xs text-gray-500">
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
