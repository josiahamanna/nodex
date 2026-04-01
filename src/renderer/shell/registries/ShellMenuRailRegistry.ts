export type ShellMenuRailItem = {
  id: string;
  title: string;
  order?: number;
  /** Optional icon (emoji/string); real icons can come later. */
  icon?: string;
  /** Either runs a command or opens a view. */
  commandId?: string;
  commandArgs?: Record<string, unknown>;
  openViewId?: string;
};

type Listener = () => void;

export class ShellMenuRailRegistry {
  private readonly items = new Map<string, ShellMenuRailItem>();
  private readonly listeners = new Set<Listener>();

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  registerItem(item: ShellMenuRailItem): () => void {
    if (!item.id || !item.title) throw new Error("MenuRailItem requires id/title");
    this.items.set(item.id, item);
    this.emit();
    return () => {
      if (this.items.get(item.id) === item) {
        this.items.delete(item.id);
        this.emit();
      }
    };
  }

  list(): ShellMenuRailItem[] {
    return [...this.items.values()].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id),
    );
  }
}

