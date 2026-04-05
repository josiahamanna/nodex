import React from "react";
import {
  markdownInternalNoteHref,
  parseInternalMarkdownNoteLink,
} from "../../utils/markdown-internal-note-href";
import { observableEmbedSrc } from "./observable-embed-url";
import { NODEX_CMD_HREF } from "./useNodexMarkdownUiComponents";
import { useMdxShell } from "./mdx-shell-context";

export { observableEmbedSrc } from "./observable-embed-url";

export function ObservableEmbed({
  notebook,
  cell,
  title,
}: {
  notebook: string;
  cell?: string;
  title?: string;
}): React.ReactElement {
  const src = observableEmbedSrc(notebook, cell);
  if (!src) {
    return (
      <div className="my-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
        Invalid Observable notebook path (expected e.g. <code className="font-mono">@user/note-slug</code>).
      </div>
    );
  }
  return (
    <div className="my-4 w-full min-w-0 overflow-hidden rounded-lg border border-border bg-muted/20">
      <iframe
        title={title ?? `Observable: ${notebook}`}
        className="h-[min(560px,70vh)] w-full border-0"
        src={src}
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export function DocLink({
  to,
  children,
}: {
  to: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const { onNodexCmdLink, onInternalNoteNavigate } = useMdxShell();
  const t = String(to ?? "").trim();
  const cmdPlain = t.match(/^command:([\w.]+)$/);
  if (cmdPlain?.[1] && onNodexCmdLink) {
    const commandId = cmdPlain[1];
    const href = `nodex-cmd:${commandId}`;
    return (
      <a
        href={href}
        className="text-primary underline underline-offset-2"
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onNodexCmdLink(commandId);
        }}
      >
        {children ?? commandId}
      </a>
    );
  }
  const nodexCmd = t.match(NODEX_CMD_HREF);
  if (nodexCmd?.[1] && onNodexCmdLink) {
    const commandId = nodexCmd[1];
    return (
      <a
        href={t}
        className="text-primary underline underline-offset-2"
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          onNodexCmdLink(commandId);
        }}
      >
        {children ?? commandId}
      </a>
    );
  }
  const internal = parseInternalMarkdownNoteLink(t);
  if (internal) {
    const canonical = markdownInternalNoteHref(internal.noteId, internal.markdownHeadingSlug);
    return (
      <a
        href={canonical}
        className="text-primary underline underline-offset-2"
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          if (onInternalNoteNavigate) {
            onInternalNoteNavigate(internal);
            return;
          }
          if (typeof window !== "undefined" && window.location.hash !== canonical) {
            window.location.hash = canonical;
          }
        }}
      >
        {children ?? internal.noteId}
      </a>
    );
  }
  return (
    <span className="text-[12px] text-muted-foreground">
      Invalid DocLink <code className="font-mono">{t}</code>
    </span>
  );
}

export function NodexCallout({
  variant = "info",
  children,
}: {
  variant?: "info" | "warning";
  children?: React.ReactNode;
}): React.ReactElement {
  const border =
    variant === "warning" ? "border-amber-500/50 bg-amber-500/10" : "border-primary/30 bg-muted/40";
  return (
    <aside className={`my-4 rounded-md border px-3 py-2 text-[13px] leading-6 ${border}`}>
      {children}
    </aside>
  );
}

export function NodexCard({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="my-4 rounded-lg border border-border bg-card p-3 shadow-sm">
      {title ? <div className="mb-2 text-[13px] font-semibold text-foreground">{title}</div> : null}
      <div className="text-[13px] leading-6">{children}</div>
    </div>
  );
}

export function NodexButton({
  command,
  children,
}: {
  command: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const { onNodexCmdLink } = useMdxShell();
  const m = String(command ?? "").trim().match(NODEX_CMD_HREF);
  const commandId = m?.[1];
  if (!commandId || !onNodexCmdLink) {
    return (
      <span className="text-[12px] text-muted-foreground">
        {commandId ? "Command links are not active here." : "Invalid NodexButton command."}
      </span>
    );
  }
  const href = `nodex-cmd:${commandId}`;
  return (
    <button
      type="button"
      className="rounded-md border border-border bg-background px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-muted/60"
      onClick={() => onNodexCmdLink(commandId)}
    >
      {children ?? commandId}
    </button>
  );
}
