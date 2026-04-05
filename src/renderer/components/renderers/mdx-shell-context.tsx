import React, { createContext, useContext } from "react";
import type { MarkdownUiLinkCallbacks } from "./useNodexMarkdownUiComponents";

export type MdxShellContextValue = MarkdownUiLinkCallbacks & {
  nestingDepth: number;
};

const MdxShellContext = createContext<MdxShellContextValue | null>(null);

export function MdxShellProvider({
  value,
  children,
}: {
  value: MdxShellContextValue;
  children: React.ReactNode;
}): React.ReactElement {
  return <MdxShellContext.Provider value={value}>{children}</MdxShellContext.Provider>;
}

export function useMdxShell(): MdxShellContextValue {
  const v = useContext(MdxShellContext);
  if (!v) {
    return {
      nestingDepth: 0,
    };
  }
  return v;
}
