import React, { useEffect, useState } from "react";

interface PluginPanelGeneralProps {
  onPluginsChanged?: () => void;
}

const PluginPanelGeneral: React.FC<PluginPanelGeneralProps> = ({
  onPluginsChanged,
}) => {
  const [path, setPath] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    void window.Nodex.getUserPluginsDirectory().then((r) => {
      if (r.path) {
        setPath(r.path);
      }
    });
  }, []);

  const run = async (
    key: string,
    fn: () => Promise<{ success: boolean; error?: string }>,
    okText: string,
  ) => {
    setWorking(key);
    setMessage(null);
    try {
      const res = await fn();
      if (res.success) {
        setMessage({ type: "success", text: okText });
        onPluginsChanged?.();
        const again = await window.Nodex.getUserPluginsDirectory();
        if (again.path) {
          setPath(again.path);
        }
      } else {
        setMessage({
          type: "error",
          text: res.error ?? "Operation failed",
        });
      }
    } catch (e) {
      setMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Operation failed",
      });
    } finally {
      setWorking(null);
    }
  };

  const handleDeleteBinAndCaches = async () => {
    if (
      !window.confirm(
        "Remove all plugins from bin/, clear ~/.nodex/plugin-cache, and clear the TypeScript main cache under the plugins folder? Sources are kept.",
      )
    ) {
      return;
    }
    await run(
      "bin",
      () => window.Nodex.deletePluginBinAndCaches(),
      "bin/, dependency cache, and plugin main cache cleared. Registry reloaded.",
    );
  };

  const handleDeleteSources = async () => {
    if (
      !window.confirm(
        "Delete everything under sources/? External IDE plugin registrations are not removed. This cannot be undone.",
      )
    ) {
      return;
    }
    await run(
      "sources",
      () => window.Nodex.deleteAllPluginSources(),
      "sources/ was emptied and the registry reloaded.",
    );
  };

  const handleFormat = async () => {
    const display = path ?? "~/.config/nodex/plugins";
    if (
      !window.confirm(
        `Format Nodex plugin data?\n\nThis deletes:\n• ${display}\n• ~/.nodex (including global npm plugin cache)\n\nSample markdown/tiptap sources will be re-seeded. Plugin disable flags are reset. Bundled core plugins are unchanged.`,
      )
    ) {
      return;
    }
    if (!window.confirm("Second confirmation: proceed with full format now?")) {
      return;
    }
    await run(
      "format",
      () => window.Nodex.formatNodexPluginData(),
      "Format complete. Plugins folder re-seeded and registry reloaded.",
    );
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-background px-4 py-4 text-foreground">
      <header className="mb-4 border-b border-border pb-3">
        <h2 className="text-[13px] font-semibold">General</h2>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Maintenance actions for the user plugins directory and global caches.
        </p>
      </header>

      <p className="mb-4 text-[11px] font-mono break-all rounded border border-border bg-muted/40 p-2 text-foreground">
        {path ?? "Loading path…"}
      </p>

      {message && (
        <div
          className={`mb-4 rounded-lg border p-3 text-[12px] ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="mb-8 space-y-3">
        <h3 className="text-[12px] font-semibold text-foreground">
          Delete all plugins (bin and cache)
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Empties <code className="rounded bg-muted px-1">bin/</code>, removes{" "}
          <code className="rounded bg-muted px-1">.plugin-main-cache</code> under
          the plugins root, and clears{" "}
          <code className="rounded bg-muted px-1">~/.nodex/plugin-cache</code>.
          Does not remove <code className="rounded bg-muted px-1">sources/</code>.
        </p>
        <button
          type="button"
          disabled={working !== null}
          className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-[12px] font-medium text-orange-950 hover:bg-orange-100 disabled:opacity-50"
          onClick={() => void handleDeleteBinAndCaches()}
        >
          {working === "bin" ? "Working…" : "Delete bin and caches"}
        </button>
      </section>

      <section className="mb-8 space-y-3">
        <h3 className="text-[12px] font-semibold text-foreground">
          Delete all sources
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Removes and recreates the empty{" "}
          <code className="rounded bg-muted px-1">sources/</code> folder.
        </p>
        <button
          type="button"
          disabled={working !== null}
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
          onClick={() => void handleDeleteSources()}
        >
          {working === "sources" ? "Working…" : "Delete all sources"}
        </button>
      </section>

      <section className="space-y-3 border-t border-destructive/25 pt-6">
        <h3 className="text-[12px] font-semibold text-destructive">Format</h3>
        <p className="text-[11px] text-muted-foreground">
          Removes <code className="rounded bg-muted px-1">~/.nodex</code> and the
          entire plugins directory, then re-seeds sample plugins and resets
          disabled-plugin flags.
        </p>
        <button
          type="button"
          disabled={working !== null}
          className="rounded-md bg-destructive px-3 py-1.5 text-[12px] font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
          onClick={() => void handleFormat()}
        >
          {working === "format" ? "Formatting…" : "Format Nodex plugin data"}
        </button>
      </section>
    </div>
  );
};

export default PluginPanelGeneral;
