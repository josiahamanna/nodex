import type { ResolvedCommandApiDoc } from "../../../command-api-metadata";

/** Strip characters that break the simple MarkdownRenderer (* / _). */
function mdSafeLine(s: string): string {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/\*{1,2}/g, "")
    .replace(/_/g, " ")
    .trim();
}

function mdSafeParagraph(s: string): string {
  return mdSafeLine(s).replace(/\n+/g, "\n\n");
}

/**
 * Build markdown for the Documentation hub command detail view (rendered via MarkdownRenderer).
 */
export function resolvedCommandDocToMarkdown(doc: ResolvedCommandApiDoc): string {
  const lines: string[] = [];

  lines.push(`# ${mdSafeLine(doc.commandId)}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(mdSafeParagraph(doc.summary));
  lines.push("");

  if (doc.category) {
    lines.push("## Category");
    lines.push("");
    lines.push(mdSafeLine(doc.category));
    lines.push("");
  }

  lines.push("## Namespace");
  lines.push("");
  lines.push(`- Namespace: ${mdSafeLine(doc.namespace)}`);
  lines.push(`- Short name: ${mdSafeLine(doc.shortName)}`);
  lines.push(`- Fully qualified id: ${mdSafeLine(doc.commandId)}`);
  lines.push("");

  lines.push("## Discovery");
  lines.push("");
  lines.push(`- palette: ${doc.palette ? "true" : "false"}`);
  lines.push(`- miniBar: ${doc.miniBar ? "true" : "false"}`);
  if (doc.sourcePluginId) {
    lines.push(`- sourcePluginId: ${mdSafeLine(String(doc.sourcePluginId))}`);
  }
  if (doc.disambiguation) {
    lines.push(`- disambiguation: ${mdSafeLine(doc.disambiguation)}`);
  }
  lines.push("");

  if (doc.apiDetails) {
    lines.push("## Extended description");
    lines.push("");
    lines.push(mdSafeParagraph(doc.apiDetails));
    lines.push("");
  }

  if (doc.proseDoc) {
    lines.push("## Documentation");
    lines.push("");
    lines.push(mdSafeParagraph(doc.proseDoc));
    lines.push("");
  }

  lines.push("## Arguments");
  lines.push("");
  if (doc.args && doc.args.length === 0) {
    lines.push(
      "This command declares no arguments; pass an empty object or omit args when invoking invokeCommand(id, args).",
    );
  } else if (doc.args && doc.args.length > 0) {
    lines.push(
      "The handler receives these fields on the args object (second parameter to invokeCommand, or minibuffer JSON):",
    );
    lines.push("");
    for (const a of doc.args) {
      const req = a.required ? "required" : "optional";
      const desc = mdSafeLine(a.description ?? "—");
      lines.push(
        `- ${mdSafeLine(a.name)} (${mdSafeLine(a.type)}, ${req}) — ${desc}`,
      );
      if (a.default !== undefined) {
        let def: string;
        try {
          def = JSON.stringify(a.default);
        } catch {
          def = String(a.default);
        }
        lines.push(`  - default: ${mdSafeLine(def)}`);
      }
    }
  } else {
    lines.push(
      "No per-field contract is registered; the handler still receives an optional record of string keys when invoked programmatically.",
    );
  }
  lines.push("");

  lines.push("## Example invoke");
  lines.push("");
  lines.push(`- commandId: ${mdSafeLine(doc.commandId)}`);
  if (doc.exampleInvoke === null) {
    lines.push("- args: (none)");
  } else if (doc.exampleInvoke && typeof doc.exampleInvoke === "object") {
    lines.push("- args:");
    for (const [k, v] of Object.entries(doc.exampleInvoke)) {
      let val: string;
      try {
        val = typeof v === "string" ? v : JSON.stringify(v);
      } catch {
        val = String(v);
      }
      lines.push(`  - ${mdSafeLine(k)}: ${mdSafeLine(val)}`);
    }
  } else if (doc.args && doc.args.length > 0) {
    lines.push("- args: (derived from defaults / examples on each field above)");
  } else {
    lines.push("- args: {}");
  }
  lines.push("");

  lines.push("## Return type");
  lines.push("");
  lines.push(`- Type: ${mdSafeLine(doc.returns.type)}`);
  if (doc.returns.description) {
    lines.push(`- Description: ${mdSafeParagraph(doc.returns.description)}`);
  }

  return lines.join("\n");
}
