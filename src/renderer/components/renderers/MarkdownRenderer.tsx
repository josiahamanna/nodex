import React, { useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { Note } from "@nodex/ui-types";
import { baseSlug } from "../../utils/markdown-heading-slugs";
import {
  parseMarkdownWelcomeShellHref,
  type WelcomeShellUrlSegment,
} from "../../shell/shellWelcomeUrlRoutes";
import {
  markdownInternalNoteHref,
  parseInternalMarkdownNoteLink,
  type InternalMarkdownNoteLink,
} from "../../utils/markdown-internal-note-href";

/** Fragment only, matches heading `id`s from this renderer (`baseSlug` + optional `-n`). */
const SAME_PAGE_HEADING_HASH = /^#([a-z0-9-]+)$/;

/** Shell command links in markdown, e.g. `[Open](nodex-cmd:nodex.docs.open)` (allowed by sanitize when callback is set). */
const NODEX_CMD_HREF = /^nodex-cmd:([\w.]+)$/;

interface MarkdownRendererProps {
  note: Note;
  /**
   * When set, `#heading-id` links call this instead of relying on the browser (e.g. Documentation hub
   * updates shell tab hash). Modifier clicks keep default navigation.
   */
  onSamePageHeadingClick?: (slug: string) => void;
  /**
   * When set, internal `#/n/...` links invoke this instead of `window.location.hash` (e.g. Documentation
   * hub keeps routes under `#/t/<docsTab>/n/...`). Modifier clicks keep default navigation.
   */
  onInternalNoteNavigate?: (link: InternalMarkdownNoteLink) => void;
  /** When set, `nodex-cmd:<commandId>` links invoke the contribution registry command (modifier clicks unchanged). */
  onNodexCmdLink?: (commandId: string) => void;
  /**
   * When set, `#/welcome` / `#/welcome/<segment>` links invoke this (updates hash + shell) so clicks do not rely
   * solely on `hashchange`. Modifier clicks keep default navigation.
   */
  onWelcomeShellSegmentClick?: (segment: "" | WelcomeShellUrlSegment) => void;
}

type MarkdownHeading = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return extractText(node.props.children);
  return "";
}

const markdownShellClass =
  "text-foreground max-w-none min-w-0 text-[13px] leading-6 " +
  "[&_h1]:text-[16px] [&_h1]:font-semibold [&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:scroll-mt-4 " +
  "[&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:scroll-mt-4 " +
  "[&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-2 [&_h3]:scroll-mt-4 " +
  "[&_h4]:text-[13px] [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1.5 [&_h4]:scroll-mt-4 " +
  "[&_h5]:text-[12px] [&_h5]:font-semibold [&_h5]:mt-3 [&_h5]:mb-1.5 [&_h5]:scroll-mt-4 " +
  "[&_h6]:text-[12px] [&_h6]:font-semibold [&_h6]:mt-3 [&_h6]:mb-1.5 [&_h6]:scroll-mt-4 " +
  "[&_p]:mb-3 [&_p]:text-[13px] " +
  "[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:my-1 " +
  "[&_strong]:font-semibold " +
  "[&_a]:text-primary [&_a]:underline underline-offset-2 " +
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-[12px] [&_table]:my-3 " +
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border [&_td]:border-border [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top " +
  "[&_tr:nth-child(even)_td]:bg-muted/15 " +
  "[&_code]:rounded-sm [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] " +
  "[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/35 [&_pre]:p-3 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[12px] " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground";

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  note,
  onSamePageHeadingClick,
  onInternalNoteNavigate,
  onNodexCmdLink,
  onWelcomeShellSegmentClick,
}) => {
  // Reset each render so heading ids match a fresh slug sequence (TOC / scroll-to-heading).
  const slugCountsRef = useRef<Map<string, number>>(new Map());
  slugCountsRef.current = new Map();

  const rehypeSanitizeSchema = useMemo(() => {
    if (!onNodexCmdLink) return defaultSchema;
    const hrefProtocols = [...(defaultSchema.protocols?.href ?? []), "nodex-cmd"];
    return {
      ...defaultSchema,
      protocols: {
        ...defaultSchema.protocols,
        href: hrefProtocols,
      },
    };
  }, [onNodexCmdLink]);

  const markdownComponents = useMemo(() => {
    const make =
      (Tag: MarkdownHeading) =>
      ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }) => {
        const text = extractText(children);
        const slugBase = baseSlug(text);
        const map = slugCountsRef.current;
        const prev = map.get(slugBase) ?? 0;
        const nextCount = prev + 1;
        map.set(slugBase, nextCount);
        const id = nextCount === 1 ? slugBase : `${slugBase}-${nextCount}`;
        return (
          <Tag id={id} {...props}>
            {children}
          </Tag>
        );
      };

    const InternalOrExternalLink = ({
      href,
      children,
      ...rest
    }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      if (typeof href === "string" && onNodexCmdLink) {
        const cmd = href.match(NODEX_CMD_HREF);
        if (cmd?.[1]) {
          const commandId = cmd[1];
          return (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
                  return;
                }
                e.preventDefault();
                onNodexCmdLink(commandId);
              }}
            >
              {children}
            </a>
          );
        }
      }
      if (typeof href === "string" && onWelcomeShellSegmentClick) {
        const welcome = parseMarkdownWelcomeShellHref(href);
        if (welcome !== undefined && welcome !== null) {
          const segment = welcome.segment;
          return (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
                  return;
                }
                e.preventDefault();
                onWelcomeShellSegmentClick(segment);
              }}
            >
              {children}
            </a>
          );
        }
      }
      const internal = typeof href === "string" ? parseInternalMarkdownNoteLink(href) : null;
      if (internal) {
        const canonical = markdownInternalNoteHref(internal.noteId, internal.markdownHeadingSlug);
        return (
          <a
            {...rest}
            href={canonical}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
                return;
              }
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
            {children}
          </a>
        );
      }
      if (typeof href === "string" && onSamePageHeadingClick) {
        const hm = href.match(SAME_PAGE_HEADING_HASH);
        if (hm?.[1]) {
          const slug = hm[1];
          return (
            <a
              {...rest}
              href={href}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
                  return;
                }
                e.preventDefault();
                onSamePageHeadingClick(slug);
              }}
            >
              {children}
            </a>
          );
        }
      }
      return (
        <a href={href} {...rest}>
          {children}
        </a>
      );
    };

    return {
      h1: make("h1"),
      h2: make("h2"),
      h3: make("h3"),
      h4: make("h4"),
      h5: make("h5"),
      h6: make("h6"),
      a: InternalOrExternalLink,
    };
  }, [onInternalNoteNavigate, onNodexCmdLink, onSamePageHeadingClick, onWelcomeShellSegmentClick]);

  return (
    <div className={`p-4 nodex-typography max-w-none min-w-0 ${markdownShellClass}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, rehypeSanitizeSchema]]}
        components={markdownComponents}
      >
        {note.content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
