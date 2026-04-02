import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { Note } from "@nodex/ui-types";

interface MarkdownRendererProps {
  note: Note;
}

type MarkdownHeading = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return extractText(node.props.children);
  return "";
}

function baseSlug(text: string): string {
  const s = text
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "section";
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

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ note }) => {
  const slugCounts = useMemo(() => new Map<string, number>(), [note.id, note.content]);
  const headingComponents = useMemo(() => {
    const make =
      (Tag: MarkdownHeading) =>
      ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement> & { children?: React.ReactNode }) => {
        const text = extractText(children);
        const slugBase = baseSlug(text);
        const prev = slugCounts.get(slugBase) ?? 0;
        const nextCount = prev + 1;
        slugCounts.set(slugBase, nextCount);
        const id = nextCount === 1 ? slugBase : `${slugBase}-${nextCount}`;
        return (
          <Tag id={id} {...props}>
            {children}
          </Tag>
        );
      };
    return {
      h1: make("h1"),
      h2: make("h2"),
      h3: make("h3"),
      h4: make("h4"),
      h5: make("h5"),
      h6: make("h6"),
    };
  }, [slugCounts]);

  return (
    <div className={`p-4 nodex-typography max-w-none min-w-0 ${markdownShellClass}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
        components={headingComponents}
      >
        {note.content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
