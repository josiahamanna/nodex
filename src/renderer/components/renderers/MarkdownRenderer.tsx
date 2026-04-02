import React, { useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import type { Note } from "@nodex/ui-types";

interface MarkdownRendererProps {
  note: Note;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ note }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const renderMarkdown = (text: string): string => {
    return text
      .replace(
        /^### (.*$)/gim,
        '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>',
      )
      .replace(
        /^## (.*$)/gim,
        '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>',
      )
      .replace(
        /^# (.*$)/gim,
        '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>',
      )
      .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em class="italic">$1</em>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>')
      .replace(/\n\n/gim, '</p><p class="mb-4">')
      .replace(/\n/gim, "<br>");
  };

  useEffect(() => {
    if (containerRef.current) {
      const html = renderMarkdown(note.content);
      const sanitized = DOMPurify.sanitize(html, {
        RETURN_TRUSTED_TYPE: false,
        ALLOWED_TAGS: ["h1", "h2", "h3", "p", "br", "strong", "em", "li", "code"],
        ALLOWED_ATTR: ["class"],
      });
      containerRef.current.innerHTML = sanitized;
    }
  }, [note.content]);

  return (
    <div className="p-8 prose max-w-none min-w-0">
      <div className="text-foreground [&_code]:rounded-sm [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11px]" ref={containerRef} />
    </div>
  );
};

export default MarkdownRenderer;
