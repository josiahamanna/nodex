import { useEffect } from "react";
import { useNodexContributionRegistry } from "../../../NodexContributionContext";
import { JsNoteEditorHost } from "./JsNoteEditor";

/**
 * Registers the in-shell React editor for `js-notebook` notes (content = JSON cell array).
 */
export function useRegisterJsNoteEditor(): void {
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    return contrib.registerNoteTypeReactEditor("js-notebook", JsNoteEditorHost);
  }, [contrib]);
}
