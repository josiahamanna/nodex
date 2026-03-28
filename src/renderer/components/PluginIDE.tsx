import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Editor from "@monaco-editor/react";
import { Note } from "../../preload";
import SecurePluginRenderer from "./renderers/SecurePluginRenderer";

interface OpenTab {
  relativePath: string;
  content: string;
  savedContent: string;
}

interface PluginIDEProps {
  onPluginsChanged?: () => void;
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
    return "javascript";
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
  const [fileList, setFileList] = useState<string[]>([]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [types, setTypes] = useState<string[]>([]);
  const [previewType, setPreviewType] = useState<string>("");
  const [previewRev, setPreviewRev] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeTab = useMemo(
    () => tabs.find((t) => t.relativePath === activePath) ?? null,
    [tabs, activePath],
  );

  const refreshTypes = useCallback(async () => {
    const t = await window.Nodex.getRegisteredTypes();
    setTypes(t);
    setPreviewType((cur) => (t.includes(cur) ? cur : t[0] ?? ""));
  }, []);

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
    if (!pluginFolder) {
      setFileList([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const files = await window.Nodex.listPluginSourceFiles(pluginFolder);
        if (!cancelled) {
          setFileList(files);
        }
      } catch (e) {
        if (!cancelled) {
          setFileList([]);
          setStatus(
            e instanceof Error ? e.message : "Could not list plugin files",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pluginFolder]);

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
          Ctrl+S save · Excludes node_modules, dist, .git
        </span>
      </header>

      {status && (
        <div className="px-4 py-1 text-sm bg-amber-50 text-amber-900 border-b border-amber-100 shrink-0">
          {status}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <aside className="w-52 border-r border-gray-200 overflow-y-auto shrink-0 bg-gray-50">
          <div className="p-2 text-xs font-medium text-gray-500 uppercase">
            Files
          </div>
          <ul className="text-sm">
            {fileList.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => openFile(f)}
                  className={`w-full text-left px-2 py-1.5 truncate hover:bg-white ${
                    activePath === f ? "bg-white font-medium text-indigo-800" : "text-gray-700"
                  }`}
                  title={f}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
                height="100%"
                theme="vs-light"
                path={activeTab.relativePath}
                language={languageForPath(activeTab.relativePath)}
                value={activeTab.content}
                onChange={(v) => markDirtyFromContent(v)}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                Select a plugin and open a file
              </div>
            )}
          </div>
        </div>

        <aside className="w-[min(100%,24rem)] border-l border-gray-200 flex flex-col min-h-0 shrink-0 bg-gray-50">
          <div className="p-2 border-b border-gray-200">
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
      </div>
    </div>
  );
};

export default PluginIDE;
