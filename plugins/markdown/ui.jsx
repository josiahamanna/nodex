import React from "react";
import { createRoot } from "react-dom/client";

function renderMarkdown(text) {
  if (!text) {
    return "";
  }
  return text
    .replace(
      /^### (.*$)/gim,
      '<h3 style="font-size: 1.25rem; font-weight: bold; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1f2937;">$1</h3>',
    )
    .replace(
      /^## (.*$)/gim,
      '<h2 style="font-size: 1.5rem; font-weight: bold; margin-top: 2rem; margin-bottom: 1rem; color: #1f2937;">$1</h2>',
    )
    .replace(
      /^# (.*$)/gim,
      '<h1 style="font-size: 2rem; font-weight: bold; margin-top: 2.5rem; margin-bottom: 1.25rem; color: #111827;">$1</h1>',
    )
    .replace(
      /\*\*(.*?)\*\*/gim,
      '<strong style="font-weight: 700; color: #374151;">$1</strong>',
    )
    .replace(/\*(.*?)\*/gim, '<em style="font-style: italic;">$1</em>')
    .replace(
      /^- (.*$)/gim,
      '<li style="margin-left: 1.5rem; margin-bottom: 0.5rem; list-style-type: disc;">$1</li>',
    )
    .replace(
      /\n\n/gim,
      '</p><p style="margin-bottom: 1rem; line-height: 1.75; color: #374151;">',
    )
    .replace(/\n/gim, "<br>");
}

function App() {
  const initial =
    typeof window !== "undefined" && window.__NODEX_NOTE__
      ? window.__NODEX_NOTE__.content
      : "";
  const [content, setContent] = React.useState(initial);

  React.useEffect(() => {
    Nodex.onMessage = (message) => {
      if (message.type === "update" || message.type === "render") {
        window.__NODEX_NOTE__ = message.payload;
        setContent(message.payload.content);
      }
    };
  }, []);

  const html =
    '<div style="color: #1f2937; line-height: 1.75; padding: 1rem;">' +
    renderMarkdown(content) +
    "</div>";

  return React.createElement("div", {
    dangerouslySetInnerHTML: { __html: html },
  });
}

const mountEl = document.getElementById("plugin-root");
if (mountEl) {
  const root = createRoot(mountEl);
  root.render(React.createElement(App));
}
