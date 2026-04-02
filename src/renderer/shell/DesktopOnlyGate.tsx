import React, { useEffect, useState } from "react";
import { DESKTOP_MIN_VIEWPORT_WIDTH_PX } from "./shellResponsiveConstants";

function readTooNarrow(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < DESKTOP_MIN_VIEWPORT_WIDTH_PX;
}

/**
 * Full-screen overlay when the viewport is too small for the shell (mobile / narrow windows).
 * Intended for desktop-class displays (~12" width in CSS pixels).
 */
export function DesktopOnlyGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const [blocked, setBlocked] = useState(readTooNarrow);

  useEffect(() => {
    const onResize = (): void => {
      setBlocked(readTooNarrow());
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <>
      {children}
      {blocked ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-background p-6 text-center shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="nodex-desktop-only-title"
          aria-describedby="nodex-desktop-only-desc"
        >
          <h1 id="nodex-desktop-only-title" className="max-w-md text-lg font-semibold text-foreground">
            Desktop display required
          </h1>
          <p id="nodex-desktop-only-desc" className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            This application is designed for desktop use. Please open it on a display at least about{" "}
            <strong className="text-foreground">12 inches</strong> wide in landscape (roughly{" "}
            <strong className="text-foreground">{DESKTOP_MIN_VIEWPORT_WIDTH_PX} CSS pixels</strong> minimum
            viewport width). Widen the window or use a larger screen to continue.
          </p>
        </div>
      ) : null}
    </>
  );
}
