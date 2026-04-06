import React from "react";
import { formatIsoDate } from "./date";
import { Alert, Badge, Button, Separator, Tab, TabList, TabPanel, Tabs } from "./ui";

/**
 * JSX tags available in MDX matching virtual `@nodex/ui` / `@nodex/date` exports
 * (imports are stripped; names must match what authors import).
 */
export function getNodexMdxFacadeComponentMap(): Record<string, React.ComponentType<Record<string, unknown>>> {
  return {
    Button,
    Badge,
    Separator,
    Alert,
    Tabs,
    TabList,
    Tab,
    TabPanel,
    /** Date helper: `<NodexFormatIso value="2024-01-15" />` — expressions are blocked for user MDX so this tag form is the safe path. */
    NodexFormatIso: ({ value }: { value?: string }) =>
      React.createElement(
        "span",
        { className: "font-mono text-[13px]" },
        value ? formatIsoDate(value) : "",
      ),
  };
}
