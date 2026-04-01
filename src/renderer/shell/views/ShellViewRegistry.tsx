import React from "react";

export type ShellRegionId =
  | "primarySidebar"
  | "mainArea"
  | "secondaryArea"
  | "bottomArea";

function injectKeyForwardingIntoSrcDoc(srcDoc: string): string {
  const forwardScript = `
<script>
  (function () {
    // Forward key chords to the host so global shell shortcuts work when focus
    // is inside this iframe document.
    const norm = (s) => String(s || "").trim().toLowerCase();
    const normalizeChord = (chord) => {
      const raw = norm(chord);
      if (!raw) return "";
      const parts = raw.split("+").map((p) => p.trim()).filter(Boolean);
      const key = parts.pop() || "";
      const mods = new Set(parts);
      const ordered = ["ctrl", "meta", "alt", "shift"].filter((m) => mods.has(m));
      return [...ordered, key].join("+");
    };
    const chordFromEvent = (e) => {
      const mods = [];
      if (e.ctrlKey) mods.push("ctrl");
      if (e.metaKey) mods.push("meta");
      if (e.altKey) mods.push("alt");
      if (e.shiftKey) mods.push("shift");
      let keyTok;
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Key([A-Z])$/.test(e.code)) {
        keyTok = e.code.slice(3).toLowerCase();
      } else {
        keyTok = (e.key && e.key.length === 1) ? e.key.toLowerCase() : String(e.key || "").toLowerCase();
      }
      return normalizeChord([...mods, keyTok].join("+"));
    };

    window.addEventListener("keydown", (e) => {
      // If the event is already handled inside the iframe, don't forward.
      if (e.defaultPrevented) return;
      // Don't forward pure modifier keys.
      const k = String(e.key || "").toLowerCase();
      if (k === "shift" || k === "control" || k === "alt" || k === "meta") return;
      const chord = chordFromEvent(e);
      if (!chord) return;
      try {
        window.parent.postMessage({ type: "nodex.shell.keys", chord }, "*");
      } catch {
        /* ignore */
      }
    }, true);
  })();
</script>
`;

  const t = srcDoc ?? "";
  // If it's a full document, inject before </body> (or </html> fallback).
  if (t.includes("</body>")) {
    return t.replace("</body>", `${forwardScript}</body>`);
  }
  if (t.includes("</html>")) {
    return t.replace("</html>", `${forwardScript}</html>`);
  }
  // Otherwise wrap fragment in a minimal document.
  return `<!doctype html><html><head><meta charset="utf-8" />${forwardScript}</head><body>${t}</body></html>`;
}

export type ShellViewDescriptor = {
  id: string;
  title: string;
  defaultRegion: ShellRegionId;
  /** One of these must be set. */
  iframeUrl?: string;
  iframeHtml?: string;
  sandboxFlags?: string;
  capabilities?: {
    allowedCommands?: "allShellCommands" | "all" | string[];
    readContext?: boolean;
  };
};

type Listener = () => void;

export class ShellViewRegistry {
  private readonly views = new Map<string, ShellViewDescriptor>();
  private readonly listeners = new Set<Listener>();
  private openByRegion: Partial<Record<ShellRegionId, string>> = {};

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  registerView(v: ShellViewDescriptor): () => void {
    if (!v.id || !v.title) {
      throw new Error("View must have id and title");
    }
    if (!v.iframeUrl && !v.iframeHtml) {
      throw new Error("View must provide iframeUrl or iframeHtml");
    }
    this.views.set(v.id, v);
    this.emit();
    return () => {
      if (this.views.get(v.id) === v) {
        this.views.delete(v.id);
        this.emit();
      }
    };
  }

  listViews(): ShellViewDescriptor[] {
    return [...this.views.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  getView(id: string): ShellViewDescriptor | undefined {
    return this.views.get(id);
  }

  openView(viewId: string, regionId?: ShellRegionId): void {
    const v = this.views.get(viewId);
    if (!v) throw new Error(`Unknown view: ${viewId}`);
    const r: ShellRegionId = regionId ?? v.defaultRegion;
    this.openByRegion = { ...this.openByRegion, [r]: v.id };
    this.emit();
  }

  closeRegion(regionId: ShellRegionId): void {
    if (!this.openByRegion[regionId]) return;
    const next = { ...this.openByRegion };
    delete next[regionId];
    this.openByRegion = next;
    this.emit();
  }

  getOpenViewId(regionId: ShellRegionId): string | null {
    return this.openByRegion[regionId] ?? null;
  }
}

export function ShellIFrameViewHost({
  view,
}: {
  view: ShellViewDescriptor;
}): React.ReactElement {
  const sandbox = view.sandboxFlags ?? "allow-scripts";
  const srcDoc =
    view.iframeHtml != null && view.iframeHtml !== ""
      ? injectKeyForwardingIntoSrcDoc(view.iframeHtml)
      : view.iframeHtml;
  const src = view.iframeUrl;
  const caps = view.capabilities ?? {};
  const allowedCommands =
    caps.allowedCommands === "allShellCommands" ||
    caps.allowedCommands === "all" ||
    Array.isArray(caps.allowedCommands)
      ? caps.allowedCommands
      : [];
  return (
    <iframe
      title={view.title}
      sandbox={sandbox}
      src={src}
      srcDoc={srcDoc}
      className="h-full w-full border-0 bg-background"
      data-nodex-view-id={view.id}
      data-nodex-allowed-commands={
        typeof allowedCommands === "string"
          ? allowedCommands
          : JSON.stringify(allowedCommands)
      }
      data-nodex-read-context={caps.readContext === true ? "1" : "0"}
    />
  );
}

