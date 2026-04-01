import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ShellLayoutStore } from "./ShellLayoutStore";

const Ctx = createContext<ShellLayoutStore | null>(null);

export function ShellLayoutProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const store = useMemo(() => new ShellLayoutStore(), []);
  const [, tick] = useReducer((x: number) => x + 1, 0);

  useEffect(() => store.subscribe(() => tick()), [store]);

  useEffect(() => {
    void store.loadFromHost();
  }, [store]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useShellLayoutStore(): ShellLayoutStore {
  const s = useContext(Ctx);
  if (!s) throw new Error("useShellLayoutStore requires ShellLayoutProvider");
  return s;
}

export function useShellLayoutState() {
  const s = useShellLayoutStore();
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => s.subscribe(() => tick()), [s]);
  return s.get();
}

