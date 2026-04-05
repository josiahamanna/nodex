import React from "react";
import { formatIsoDate } from "./date";
import { Button } from "./ui";

/**
 * JSX tags available in MDX matching virtual `@nodex/ui` / `@nodex/date` exports
 * (imports are stripped; names must match what authors import).
 */
export function getNodexMdxFacadeComponentMap(): Record<string, React.ComponentType<Record<string, unknown>>> {
  return {
    Button,
    /** Date helpers exposed as dummy host elements is awkward; authors use `formatIsoDate` via expression is blocked for user MDX — re-export as unused tag would be odd. */
    NodexFormatIso: ({ value }: { value?: string }) =>
      React.createElement(
        "span",
        { className: "font-mono text-[13px]" },
        value ? formatIsoDate(value) : "",
      ),
  };
}
