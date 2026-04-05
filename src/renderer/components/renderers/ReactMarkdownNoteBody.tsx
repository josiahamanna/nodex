import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { Note } from "@nodex/ui-types";
import type { WelcomeShellUrlSegment } from "../../shell/shellWelcomeUrlRoutes";
import type { InternalMarkdownNoteLink } from "../../utils/markdown-internal-note-href";
import {
  markdownShellClass,
  useNodexMarkdownUiComponents,
} from "./useNodexMarkdownUiComponents";

export interface MarkdownRendererProps {
  note: Note;
  onSamePageHeadingClick?: (slug: string) => void;
  onInternalNoteNavigate?: (link: InternalMarkdownNoteLink) => void;
  onNodexCmdLink?: (commandId: string) => void;
  onWelcomeShellSegmentClick?: (segment: "" | WelcomeShellUrlSegment) => void;
}

/**
 * Plain markdown body (react-markdown). Shared with MDX doc embeds for non-MDX notes.
 */
export function ReactMarkdownNoteBody({
  note,
  onSamePageHeadingClick,
  onInternalNoteNavigate,
  onNodexCmdLink,
  onWelcomeShellSegmentClick,
}: MarkdownRendererProps): React.ReactElement {
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

  const { components } = useNodexMarkdownUiComponents({
    onSamePageHeadingClick,
    onInternalNoteNavigate,
    onNodexCmdLink,
    onWelcomeShellSegmentClick,
  });

  return (
    <div className={`p-4 nodex-typography max-w-none min-w-0 ${markdownShellClass}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, rehypeSanitizeSchema]]}
        components={components}
      >
        {note.content}
      </ReactMarkdown>
    </div>
  );
}
