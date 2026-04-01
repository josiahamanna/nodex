/** In-app contribution registry (commands + mode line). Mirrors architecture: palette/mini bar + stacked segments. */

export type CommandHandler = (
  args?: Record<string, unknown>,
) => void | Promise<void>;

export type CommandContribution = {
  id: string;
  title: string;
  category?: string;
  sourcePluginId?: string | null;
  disambiguation?: string;
  /** Include in command palette (default true). */
  palette?: boolean;
  /** Expose to mini-bar style completion (default true). */
  miniBar?: boolean;
  doc?: string | null;
  handler: CommandHandler;
};

export type ModeLineSegmentId =
  | "host.left"
  | "host.center"
  | "host.right"
  | "plugin.primary"
  | "plugin.secondary";

export type ModeLineContribution = {
  id: string;
  segment: ModeLineSegmentId;
  priority: number;
  text: string;
  sourcePluginId?: string | null;
  transient?: boolean;
};

type Listener = () => void;

export class NodexContributionRegistry {
  private readonly commands = new Map<string, CommandContribution>();
  private readonly modeLine = new Map<string, ModeLineContribution>();
  private readonly listeners = new Set<Listener>();

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(): void {
    for (const l of this.listeners) {
      l();
    }
  }

  /** Replace if same id; returns dispose. */
  registerCommand(c: CommandContribution): () => void {
    const merged: CommandContribution = {
      palette: true,
      miniBar: true,
      sourcePluginId: null,
      ...c,
    };
    const { id } = merged;
    this.commands.set(id, merged);
    this.emit();
    return () => {
      if (this.commands.get(id) === merged) {
        this.commands.delete(id);
        this.emit();
      }
    };
  }

  registerModeLineItem(c: ModeLineContribution): () => void {
    const { id } = c;
    this.modeLine.set(id, c);
    this.emit();
    return () => {
      if (this.modeLine.get(id) === c) {
        this.modeLine.delete(id);
        this.emit();
      }
    };
  }

  listCommands(): CommandContribution[] {
    return [...this.commands.values()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
  }

  listModeLineForSegment(segment: ModeLineSegmentId): ModeLineContribution[] {
    return [...this.modeLine.values()]
      .filter((m) => m.segment === segment)
      .sort(
        (a, b) =>
          b.priority - a.priority ||
          (a.sourcePluginId ?? "").localeCompare(b.sourcePluginId ?? "") ||
          a.id.localeCompare(b.id),
      );
  }

  getCommand(id: string): CommandContribution | undefined {
    return this.commands.get(id);
  }

  invokeCommand(
    id: string,
    args?: Record<string, unknown>,
  ): void | Promise<void> {
    const cmd = this.commands.get(id);
    if (!cmd) {
      throw new Error(`Unknown command: ${id}`);
    }
    return cmd.handler(args);
  }
}
