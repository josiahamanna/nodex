import React from "react";

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
