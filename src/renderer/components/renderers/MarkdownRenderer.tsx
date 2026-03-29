import React, { useRef, useEffect } from "react";
import DOMPurify from "dompurify";

if (typeof window !== "undefined") {
  DOMPurify.setConfig({
    RETURN_TRUSTED_TYPE: false,
    TRUSTED_TYPES_POLICY: identityTrustedTypesPolicy(),
  });
}

/** Runtime identity policy; TS types expect TrustedHTML but string is valid for RETURN_TRUSTED_TYPE false. */
function identityTrustedTypesPolicy(): {
  createHTML: (html: string) => string;
  createScriptURL: (url: string) => string;
} {
  return {
    createHTML: (html: string) => html,
    createScriptURL: (url: string) => url,
  };
}
import { Note } from "../../../preload";

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
        TRUSTED_TYPES_POLICY: identityTrustedTypesPolicy(),
        ALLOWED_TAGS: ["h1", "h2", "h3", "p", "br", "strong", "em", "li"],
        ALLOWED_ATTR: ["class"],
      } as Parameters<typeof DOMPurify.sanitize>[1]);
      containerRef.current.innerHTML = sanitized;
    }
  }, [note.content]);

  return (
    <div className="p-8 prose max-w-none">
      <div className="text-gray-800" ref={containerRef} />
    </div>
  );
};

export default MarkdownRenderer;
