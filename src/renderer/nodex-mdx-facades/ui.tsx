import React, { useState } from "react";

/** Primary button — Tailwind tokens only; use inside MDX via MDXProvider map or `import` (stripped). */
export function Button({
  children,
  variant = "default",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline";
}): React.ReactElement {
  const base =
    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors";
  const styles =
    variant === "outline"
      ? "border border-border bg-background text-foreground hover:bg-muted/50"
      : "bg-primary text-primary-foreground hover:bg-primary/90";
  return (
    <button type="button" className={`${base} ${styles}`} {...rest}>
      {children}
    </button>
  );
}

/** Inline status/label badge. variant: default | secondary | destructive | outline */
export function Badge({
  children,
  variant = "default",
}: {
  children?: React.ReactNode;
  variant?: "default" | "secondary" | "destructive" | "outline";
}): React.ReactElement {
  const styles: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/15 text-destructive",
    outline: "border border-border text-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${styles[variant] ?? styles.default}`}
    >
      {children}
    </span>
  );
}

/** Horizontal or vertical visual divider. */
export function Separator({
  orientation = "horizontal",
}: {
  orientation?: "horizontal" | "vertical";
}): React.ReactElement {
  if (orientation === "vertical") {
    return <span className="mx-2 inline-block h-4 w-px bg-border align-middle" aria-hidden />;
  }
  return <hr className="my-4 border-t border-border" />;
}

/** Alert / callout block. variant: info | success | warning | destructive */
export function Alert({
  children,
  variant = "info",
  title,
}: {
  children?: React.ReactNode;
  variant?: "info" | "success" | "warning" | "destructive";
  title?: string;
}): React.ReactElement {
  const styles: Record<string, string> = {
    info: "border-primary/30 bg-primary/5 text-foreground",
    success: "border-green-500/40 bg-green-500/10 text-green-900 dark:text-green-200",
    warning: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    destructive: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <div
      className={`my-4 rounded-md border px-3 py-2.5 text-[13px] leading-6 ${styles[variant] ?? styles.info}`}
      role="alert"
    >
      {title ? <div className="mb-1 font-semibold">{title}</div> : null}
      {children}
    </div>
  );
}

const TabsContext = React.createContext<{
  active: string | undefined;
  setActive: (id: string) => void;
} | null>(null);

/** Tab container — wraps TabList and TabPanel children. defaultTab sets the initially visible panel id. */
export function Tabs({
  children,
  defaultTab,
}: {
  children?: React.ReactNode;
  defaultTab?: string;
}): React.ReactElement {
  const [active, setActive] = useState<string | undefined>(defaultTab);
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className="my-4">{children}</div>
    </TabsContext.Provider>
  );
}

/** Tab button strip. Place Tab children inside. */
export function TabList({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex border-b border-border" role="tablist">
      {children}
    </div>
  );
}

/** Individual tab trigger. id must match the corresponding TabPanel id. */
export function Tab({
  id,
  children,
}: {
  id: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const ctx = React.useContext(TabsContext);
  const isActive = ctx?.active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx?.setActive(id)}
      className={`-mb-px border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors ${
        isActive
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/** Content panel shown only when its id matches the active Tab. */
export function TabPanel({
  id,
  children,
}: {
  id: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const ctx = React.useContext(TabsContext);
  if (ctx?.active !== id) return <></>;
  return <div className="pt-3">{children}</div>;
}
