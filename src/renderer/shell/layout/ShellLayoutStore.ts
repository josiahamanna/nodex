import { shouldSkipDurableChromePersistence } from "../../cloud-sync/signed-in-cloud-offline";
import { getNodex } from "../../../shared/nodex-host-access";
import { coerceShellLayoutState, defaultShellLayoutState, type ShellLayoutState, type ShellRegionId } from "./ShellLayoutState";

type Listener = () => void;

export class ShellLayoutStore {
  private state: ShellLayoutState = defaultShellLayoutState();
  private readonly listeners = new Set<Listener>();
  private persistTimer: number | null = null;
  private loadFromHostInflight: Promise<void> | null = null;

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  get(): ShellLayoutState {
    return this.state;
  }

  set(next: ShellLayoutState): void {
    this.state = next;
    this.emit();
    this.schedulePersist();
  }

  patch(fn: (cur: ShellLayoutState) => ShellLayoutState): void {
    this.set(fn(this.state));
  }

  setVisible(region: ShellRegionId, visible: boolean): void {
    this.patch((cur) => ({
      ...cur,
      visible: { ...cur.visible, [region]: visible },
    }));
  }

  toggle(region: ShellRegionId): void {
    this.setVisible(region, !this.state.visible[region]);
  }

  async loadFromHost(): Promise<void> {
    if (this.loadFromHostInflight) {
      await this.loadFromHostInflight;
      return;
    }
    this.loadFromHostInflight = (async () => {
      try {
        const raw = await getNodex().getShellLayout();
        this.state = coerceShellLayoutState(raw);
        this.emit();
      } catch {
        // ignore, fall back to defaults
      }
    })();
    try {
      await this.loadFromHostInflight;
    } finally {
      this.loadFromHostInflight = null;
    }
  }

  private schedulePersist(): void {
    if (shouldSkipDurableChromePersistence()) {
      return;
    }
    if (this.persistTimer != null) {
      window.clearTimeout(this.persistTimer);
    }
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void this.persistToHost();
    }, 250);
  }

  async persistToHost(): Promise<void> {
    if (shouldSkipDurableChromePersistence()) {
      return;
    }
    try {
      const r = await getNodex().setShellLayout(this.state);
      if ("ok" in r && r.ok === false) {
        // eslint-disable-next-line no-console
        console.warn("[ShellLayoutStore] persist failed:", r.error);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[ShellLayoutStore] persist failed:", e);
    }
  }
}

