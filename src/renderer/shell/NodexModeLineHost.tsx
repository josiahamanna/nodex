import React, { useMemo } from "react";
import { useNodexModeLineSegment } from "./NodexContributionContext";

function joinSegment(items: { text: string }[]): string {
  return items.map((i) => i.text).filter(Boolean).join(" · ");
}

/**
 * Thin shell view: renders stacked mode-line segments from the contribution registry.
 * Host segments use flex; plugin segments truncate with title tooltips.
 */
export function NodexModeLineHost(): React.ReactElement {
  const left = useNodexModeLineSegment("host.left");
  const center = useNodexModeLineSegment("host.center");
  const right = useNodexModeLineSegment("host.right");
  const pluginPri = useNodexModeLineSegment("plugin.primary");
  const pluginSec = useNodexModeLineSegment("plugin.secondary");

  const leftText = useMemo(() => joinSegment(left), [left]);
  const centerText = useMemo(() => joinSegment(center), [center]);
  const rightText = useMemo(() => joinSegment(right), [right]);
  const priText = useMemo(() => joinSegment(pluginPri), [pluginPri]);
  const secText = useMemo(() => joinSegment(pluginSec), [pluginSec]);

  const showPluginRow = priText.length > 0 || secText.length > 0;

  return (
    <div
      className="nodex-mode-line-host shrink-0 border-t border-border bg-muted/30 text-muted-foreground"
      data-testid="nodex-mode-line"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-h-[22px] items-center gap-2 px-2 py-0.5 text-[11px] leading-tight">
        <span
          className="min-w-0 shrink truncate font-medium"
          title={leftText || undefined}
        >
          {leftText}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-center"
          title={centerText || undefined}
        >
          {centerText}
        </span>
        <span
          className="min-w-0 shrink truncate text-right tabular-nums"
          title={rightText || undefined}
        >
          {rightText}
        </span>
      </div>
      {showPluginRow ? (
        <div className="flex min-h-[20px] items-center gap-2 border-t border-border/60 px-2 py-0.5 text-[10px] leading-tight text-muted-foreground/90">
          <span className="min-w-0 flex-1 truncate" title={priText || undefined}>
            {priText}
          </span>
          <span className="min-w-0 shrink truncate opacity-80" title={secText || undefined}>
            {secText}
          </span>
        </div>
      ) : null}
    </div>
  );
}
