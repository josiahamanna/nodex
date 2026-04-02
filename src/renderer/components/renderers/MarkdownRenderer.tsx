import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { Note } from "@nodex/ui-types";

interface MarkdownRendererProps {
  note: Note;
}

const markdownShellClass =
  "text-foreground max-w-none min-w-0 " +
  "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-8 [&_h1]:mb-4 [&_h1]:scroll-mt-4 " +
  "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:scroll-mt-4 " +
  "[&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:scroll-mt-4 " +
  "[&_p]:mb-4 [&_p]:leading-relaxed " +
  "[&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 " +
  "[&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_li]:my-1 " +
  "[&_strong]:font-semibold " +
  "[&_a]:text-primary [&_a]:underline underline-offset-2 " +
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_table]:my-4 " +
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold " +
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top " +
  "[&_tr:nth-child(even)_td]:bg-muted/20 " +
  "[&_code]:rounded-sm [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12px] " +
  "[&_pre]:my-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted/40 [&_pre]:p-4 " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[13px] " +
  "[&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground";

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ note }) => {
  return (
    <div className={`p-8 prose max-w-none min-w-0 ${markdownShellClass}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
      >
        {note.content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
