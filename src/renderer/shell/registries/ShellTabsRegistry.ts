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
  /** When set, `openOrReuseTab` activates an existing instance with the same key and type instead of creating one. */
  reuseKey?: string;
  /** When true, this note tab is not replaced by the next preview open (double-click tab title to pin). */
  pinned?: boolean;
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

  openTab(
    tabTypeId: string,
    title?: string,
    state?: unknown,
    reuseKey?: string,
  ): ShellTabInstance {
    const type = this.types.get(tabTypeId);
    if (!type) throw new Error(`Unknown tab type: ${tabTypeId}`);
    const instanceId = `${tabTypeId}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const inst: ShellTabInstance = { instanceId, tabTypeId, title, state, reuseKey };
    this.instances = [...this.instances, inst];
    this.activeInstanceId = instanceId;
    this.emit();
    return inst;
  }

  /**
   * Opens a tab or focuses an existing one when `reuseKey` matches (same tab type).
   */
  openOrReuseTab(
    tabTypeId: string,
    opts?: { title?: string; state?: unknown; reuseKey?: string },
  ): ShellTabInstance {
    const rk = opts?.reuseKey;
    if (rk) {
      const existing = this.instances.find(
        (i) => i.reuseKey === rk && i.tabTypeId === tabTypeId,
      );
      if (existing) {
        if (opts?.title !== undefined) existing.title = opts.title;
        if (opts?.state !== undefined) existing.state = opts.state;
        this.activeInstanceId = existing.instanceId;
        this.emit();
        return existing;
      }
    }
    return this.openTab(tabTypeId, opts?.title, opts?.state, rk);
  }

  reorderTabs(fromIndex: number, toIndex: number): void {
    const n = this.instances.length;
    if (fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) return;
    if (fromIndex === toIndex) return;
    const next = [...this.instances];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    this.instances = next;
    this.emit();
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

  /**
   * Promote a note tab from preview (`note:preview`) to a pinned tab with its own `reuseKey`.
   */
  pinNoteTab(instanceId: string, shellTabNoteTypeId: string): void {
    const inst = this.instances.find((t) => t.instanceId === instanceId);
    if (!inst || inst.tabTypeId !== shellTabNoteTypeId) return;
    const st = inst.state as { noteId?: string } | undefined;
    const noteId = st?.noteId;
    if (typeof noteId !== "string" || !noteId) return;
    inst.pinned = true;
    inst.reuseKey = `note:${noteId}`;
    this.emit();
  }

  findNoteTabByNoteId(noteId: string, shellTabNoteTypeId: string): ShellTabInstance | null {
    return (
      this.instances.find(
        (t) =>
          t.tabTypeId === shellTabNoteTypeId &&
          (t.state as { noteId?: string } | undefined)?.noteId === noteId,
      ) ?? null
    );
  }

  updateTabPresentation(
    instanceId: string,
    patch: { title?: string; state?: unknown },
  ): void {
    const inst = this.instances.find((t) => t.instanceId === instanceId);
    if (!inst) return;
    if (patch.title !== undefined) inst.title = patch.title;
    if (patch.state !== undefined) inst.state = patch.state;
    this.emit();
  }
}

