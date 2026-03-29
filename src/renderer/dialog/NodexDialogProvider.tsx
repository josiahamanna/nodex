import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type NodexConfirmOptions = {
  title?: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
};

export type NodexAlertOptions = {
  title?: string;
  message: string;
  detail?: string;
  okLabel?: string;
};

type QueueItem =
  | {
      kind: "confirm";
      options: NodexConfirmOptions;
      resolve: (v: boolean) => void;
    }
  | {
      kind: "alert";
      options: NodexAlertOptions;
      resolve: () => void;
    };

type NodexDialogContextValue = {
  confirm: (options: NodexConfirmOptions) => Promise<boolean>;
  alert: (options: NodexAlertOptions) => Promise<void>;
};

const NodexDialogContext = createContext<NodexDialogContextValue | null>(
  null,
);

export function useNodexDialog(): NodexDialogContextValue {
  const c = useContext(NodexDialogContext);
  if (!c) {
    throw new Error("useNodexDialog must be used within NodexDialogProvider");
  }
  return c;
}

export function NodexDialogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const queueRef = useRef<QueueItem[]>([]);
  const [active, setActive] = useState<QueueItem | null>(null);

  const dismiss = useCallback((confirmResult?: boolean) => {
    setActive((cur) => {
      if (!cur) {
        return queueRef.current.shift() ?? null;
      }
      if (cur.kind === "confirm") {
        cur.resolve(confirmResult ?? false);
      } else {
        cur.resolve();
      }
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const confirm = useCallback((options: NodexConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      queueRef.current.push({ kind: "confirm", options, resolve });
      setActive((cur) => cur ?? (queueRef.current.shift() ?? null));
    });
  }, []);

  const alert = useCallback((options: NodexAlertOptions) => {
    return new Promise<void>((resolve) => {
      queueRef.current.push({ kind: "alert", options, resolve });
      setActive((cur) => cur ?? (queueRef.current.shift() ?? null));
    });
  }, []);

  useEffect(() => {
    if (!active) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (active.kind === "confirm") {
          dismiss(false);
        } else {
          dismiss();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, dismiss]);

  const portal =
    active &&
    createPortal(
      <div
        className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            if (active.kind === "confirm") {
              dismiss(false);
            } else {
              dismiss();
            }
          }
        }}
      >
        <div
          className="w-full max-w-md rounded-lg border border-border bg-background p-4 text-foreground shadow-lg outline-none"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="nodex-dialog-title"
          aria-describedby="nodex-dialog-desc"
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="nodex-dialog-title"
            className="text-[14px] font-semibold leading-snug text-foreground"
          >
            {active.kind === "confirm"
              ? (active.options.title ?? "Confirm")
              : (active.options.title ?? "Notice")}
          </h2>
          <p
            id="nodex-dialog-desc"
            className="mt-2 whitespace-pre-wrap text-[13px] leading-snug text-foreground/90"
          >
            {active.options.message}
          </p>
          {active.options.detail ? (
            <p className="mt-2 whitespace-pre-wrap text-[12px] leading-snug text-muted-foreground">
              {active.options.detail}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {active.kind === "confirm" ? (
              <>
                <button
                  type="button"
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-muted/60"
                  onClick={() => dismiss(false)}
                >
                  {active.options.cancelLabel ?? "Cancel"}
                </button>
                <button
                  type="button"
                  className={`nodex-dialog-btn-${
                    active.options.variant === "danger" ? "danger" : "primary"
                  } rounded-md px-3 py-1.5 text-[12px] font-semibold shadow-sm`}
                  onClick={() => dismiss(true)}
                >
                  {active.options.confirmLabel ?? "OK"}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="nodex-dialog-btn-primary rounded-md px-3 py-1.5 text-[12px] font-semibold shadow-sm"
                onClick={() => dismiss()}
              >
                {active.options.okLabel ?? "OK"}
              </button>
            )}
          </div>
        </div>
      </div>,
      document.body,
    );

  const value = useMemo(
    () => ({ confirm, alert }),
    [confirm, alert],
  );

  return (
    <NodexDialogContext.Provider value={value}>
      {children}
      {portal}
    </NodexDialogContext.Provider>
  );
}
