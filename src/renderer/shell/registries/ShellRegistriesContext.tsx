import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { ShellAppMenuRegistry } from "./ShellAppMenuRegistry";
import { ShellMenuRailRegistry } from "./ShellMenuRailRegistry";
import { ShellKeymapRegistry } from "./ShellKeymapRegistry";
import { ShellPanelMenuRegistry } from "./ShellPanelMenuRegistry";
import { ShellTabsRegistry } from "./ShellTabsRegistry";

export type ShellRegistries = {
  appMenu: ShellAppMenuRegistry;
  menuRail: ShellMenuRailRegistry;
  keymap: ShellKeymapRegistry;
  panelMenu: ShellPanelMenuRegistry;
  tabs: ShellTabsRegistry;
};

const Ctx = createContext<ShellRegistries | null>(null);

export function ShellRegistriesProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const regs = useMemo<ShellRegistries>(() => {
    return {
      appMenu: new ShellAppMenuRegistry(),
      menuRail: new ShellMenuRailRegistry(),
      keymap: new ShellKeymapRegistry(),
      panelMenu: new ShellPanelMenuRegistry(),
      tabs: new ShellTabsRegistry(),
    };
  }, []);

  // Ensure React re-renders when registries change (for shell chrome).
  const [, tick] = useReducer((x: number) => x + 1, 0);
  useEffect(() => regs.appMenu.subscribe(() => tick()), [regs]);
  useEffect(() => regs.menuRail.subscribe(() => tick()), [regs]);
  useEffect(() => regs.keymap.subscribe(() => tick()), [regs]);
  useEffect(() => regs.panelMenu.subscribe(() => tick()), [regs]);
  useEffect(() => regs.tabs.subscribe(() => tick()), [regs]);

  return <Ctx.Provider value={regs}>{children}</Ctx.Provider>;
}

export function useShellRegistries(): ShellRegistries {
  const r = useContext(Ctx);
  if (!r) throw new Error("useShellRegistries requires ShellRegistriesProvider");
  return r;
}

