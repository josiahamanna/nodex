import React, { useCallback, useState } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import { ObservableNotebookWorkspace } from "./ObservableNotebookWorkspace";
import { makeNotebookCellId, type NotebookCell } from "./observable-notebook-types";

const LS_KEY = "nodex.observableNotebook.cells.v1";

function safeParse(raw: string | null, fb: NotebookCell[]): NotebookCell[] {
  try {
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? (v as NotebookCell[]) : fb;
  } catch {
    return fb;
  }
}

function defaults(): NotebookCell[] {
  return [
    { id: makeNotebookCellId(), name: "x", inputs: [], body: "42", kind: "js" },
    { id: makeNotebookCellId(), name: "y", inputs: ["x"], body: "x + 1", kind: "js" },
    { id: makeNotebookCellId(), name: "view", inputs: ["y"], body: "'y = ' + y", kind: "js" },
  ];
}

export function ObservableNotebookShellView(_props: ShellViewComponentProps): React.ReactElement {
  const contrib = useNodexContributionRegistry();
  const [cells, setCells] = useState<NotebookCell[]>(() => {
    if (typeof localStorage === "undefined") return defaults();
    const parsed = safeParse(localStorage.getItem(LS_KEY), []);
    return parsed.length ? parsed : defaults();
  });

  const persist = useCallback((next: NotebookCell[]) => {
    setCells(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const invokeCommand = useCallback(
    (commandId: string, args?: Record<string, unknown>) =>
      Promise.resolve(contrib.invokeCommand(commandId, args)).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error("[ObservableNotebook]", commandId, err);
      }),
    [contrib],
  );

  return (
    <ObservableNotebookWorkspace
      cells={cells}
      onCellsChange={persist}
      invokeCommand={invokeCommand}
      modeLineScopeId="nodex.shell.observable-scratch"
      executeOnMount
      toolbarHint={<span>Scratch (not a project note)</span>}
    />
  );
}
