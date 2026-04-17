import React from "react";
import { createPortal } from "react-dom";
import { AdminConsole } from "./AdminConsole";

export type AdminConsoleModalProps = {
  open: boolean;
  onClose: () => void;
};

const backdrop =
  "fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm";
const panel =
  "flex h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl";
const header =
  "flex items-center justify-between border-b border-border px-4 py-2 text-sm font-semibold";
const closeBtn =
  "rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/30 hover:text-foreground";

/**
 * Fullscreen-ish modal hosting the AdminConsole. Backdrop click + Esc close.
 * Mirrors PublishToMarketModal's portal pattern.
 */
export function AdminConsoleModal({
  open,
  onClose,
}: AdminConsoleModalProps): React.ReactElement | null {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return (): void => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={backdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Admin console"
      >
        <div className={header}>
          <span>Admin console</span>
          <button type="button" className={closeBtn} onClick={onClose}>
            Close (Esc)
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <AdminConsole />
        </div>
      </div>
    </div>,
    document.body,
  );
}
