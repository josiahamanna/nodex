export type ShellTabType = {
  id: string;
  title: string;
  order?: number;
  /** View id to open in main area when tab is active. */
  viewId: string;
};

export type ShellTabInstance = {
  instanceId: string;
  tabTypeId: string;
  title?: string;
  state?: unknown;
};

type Listener = () => void;

export class ShellTabsRegistry {
  private readonly types = new Map<string, ShellTabType>();
  private instances: ShellTabInstance[] = [];
  private activeInstanceId: string | null = null;
  private readonly listeners = new Set<Listener>();

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  registerTabType(t: ShellTabType): () => void {
    if (!t.id || !t.title || !t.viewId) throw new Error("TabType requires id/title/viewId");
    this.types.set(t.id, t);
    this.emit();
    return () => {
      if (this.types.get(t.id) === t) {
        this.types.delete(t.id);
        this.emit();
      }
    };
  }

  listTabTypes(): ShellTabType[] {
    return [...this.types.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
  }

  openTab(tabTypeId: string, title?: string, state?: unknown): ShellTabInstance {
    const type = this.types.get(tabTypeId);
    if (!type) throw new Error(`Unknown tab type: ${tabTypeId}`);
    const instanceId = `${tabTypeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const inst: ShellTabInstance = { instanceId, tabTypeId, title, state };
    this.instances = [...this.instances, inst];
    this.activeInstanceId = instanceId;
    this.emit();
    return inst;
  }

  closeTab(instanceId: string): void {
    const before = this.instances;
    this.instances = before.filter((t) => t.instanceId !== instanceId);
    if (this.activeInstanceId === instanceId) {
      this.activeInstanceId = this.instances.at(-1)?.instanceId ?? null;
    }
    if (before.length !== this.instances.length) {
      this.emit();
    }
  }

  listOpenTabs(): ShellTabInstance[] {
    return [...this.instances];
  }

  getActiveTab(): ShellTabInstance | null {
    if (!this.activeInstanceId) return null;
    return this.instances.find((t) => t.instanceId === this.activeInstanceId) ?? null;
  }

  setActiveTab(instanceId: string): void {
    if (this.activeInstanceId === instanceId) return;
    if (!this.instances.some((t) => t.instanceId === instanceId)) return;
    this.activeInstanceId = instanceId;
    this.emit();
  }

  resolveViewForInstance(instanceId: string): string | null {
    const inst = this.instances.find((t) => t.instanceId === instanceId);
    if (!inst) return null;
    return this.types.get(inst.tabTypeId)?.viewId ?? null;
  }
}

