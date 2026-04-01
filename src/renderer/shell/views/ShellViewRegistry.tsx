import React from "react";

export type ShellRegionId =
  | "primarySidebar"
  | "mainArea"
  | "secondaryArea"
  | "bottomArea";

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
  const srcDoc = view.iframeHtml;
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

