import { useEffect } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { ObservableNoteEditorHost } from "./ObservableNoteEditor";

/**
 * Registers the in-shell React editor for `observable` notes (content = JSON cell array).
 */
export function useRegisterObservableNoteEditor(): void {
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    return contrib.registerNoteTypeReactEditor("observable", ObservableNoteEditorHost);
  }, [contrib]);
}
