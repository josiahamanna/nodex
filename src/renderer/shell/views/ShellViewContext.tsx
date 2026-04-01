import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ShellViewRegistry } from "./ShellViewRegistry";

const Ctx = createContext<ShellViewRegistry | null>(null);

export function ShellViewProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const reg = useMemo(() => new ShellViewRegistry(), []);
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => reg.subscribe(() => tick()), [reg]);
  return <Ctx.Provider value={reg}>{children}</Ctx.Provider>;
}

export function useShellViewRegistry(): ShellViewRegistry {
  const r = useContext(Ctx);
  if (!r) throw new Error("useShellViewRegistry requires ShellViewProvider");
  return r;
}

