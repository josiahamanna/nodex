import type { Note } from "../shared/plugin-api";
import { Registry } from "./registry";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Registers `observable` note type for create-note validation and iframe/HTML fallback.
 * Full editing uses the shell React editor ({@link useRegisterObservableNoteEditor}).
 */
export function registerBuiltinObservableNoteRenderer(reg: Registry): void {
  if (reg.getRenderer("observable")) {
    return;
  }
  reg.registerRenderer(
    "builtin.observable-note",
    "observable",
    {
      render: async (note: Note) => {
        const body = escapeHtml((note.content ?? "").slice(0, 12_000));
        return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Observable</title></head><body style="margin:0;font:13px system-ui,sans-serif;background:#0b1020;color:#e5e7eb;padding:12px;"><p style="opacity:.75;margin:0 0 8px">Observable notebook — use the Nodex shell for the full editor.</p><pre style="white-space:pre-wrap;word-break:break-word;margin:0">${body}</pre></body></html>`;
      },
    },
    { theme: "inherit", hostTier: "user" },
  );
}
