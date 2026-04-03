import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { WpnBacklinkSourceItem } from "../../../shared/wpn-v2-types";
import type { RootState } from "../../store";
import { baseSlug, stripInlineMarkdownHeadingSource } from "../../utils/markdown-heading-slugs";
import { useShellActiveMainTab } from "../ShellActiveTabContext";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";
import { useShellNavigation } from "../useShellNavigation";
import { SHELL_TAB_NOTE } from "./shellWorkspaceIds";
import type { ShellNoteTabState } from "../shellTabUrlSync";

type TocRow = { level: number; text: string; slug: string };

function parseHeadings(md: string): TocRow[] {
  const out: TocRow[] = [];
  const counts = new Map<string, number>();
  const lines = md.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";

    const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx) {
      const level = atx[1]!.length;
      const text = atx[2]!.trim();
      if (!text) continue;
      const slugBase = baseSlug(stripInlineMarkdownHeadingSource(text));
      const prev = counts.get(slugBase) ?? 0;
      const n = prev + 1;
      counts.set(slugBase, n);
      const slug = n === 1 ? slugBase : `${slugBase}-${n}`;
      out.push({ level, text, slug });
      continue;
    }

    const next = lines[i + 1] ?? "";
    const setext = /^(=+|-+)\s*$/.exec(next);
    if (setext && line.trim().length > 0) {
      const level = setext[1]!.startsWith("=") ? 1 : 2;
      const text = line.trim();
      const slugBase = baseSlug(stripInlineMarkdownHeadingSource(text));
      const prev = counts.get(slugBase) ?? 0;
      const n = prev + 1;
      counts.set(slugBase, n);
      const slug = n === 1 ? slugBase : `${slugBase}-${n}`;
      out.push({ level, text, slug });
      i += 1;
    }
  }

  return out;
}

export function MarkdownTocShellView(_props: ShellViewComponentProps): React.ReactElement {
  const tab = useShellActiveMainTab();
  const { tabs } = useShellRegistries();
  const { openNoteById } = useShellNavigation();
  const currentNote = useSelector((s: RootState) => s.notes.currentNote);

  const noteId =
    tab && typeof tab.state === "object" && tab.state !== null
      ? (tab.state as ShellNoteTabState).noteId
      : undefined;

  const isMarkdown =
    currentNote != null &&
    currentNote.id === noteId &&
    (currentNote.type === "markdown" || currentNote.type === "root");

  const rows = useMemo(() => {
    if (!isMarkdown) return [];
    return parseHeadings(currentNote?.content ?? "");
  }, [currentNote?.content, isMarkdown]);

  const [backlinks, setBacklinks] = useState<WpnBacklinkSourceItem[]>([]);
  const [backlinkError, setBacklinkError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMarkdown || !currentNote?.id) {
      setBacklinks([]);
      setBacklinkError(null);
      return;
    }
    let cancelled = false;
    setBacklinkError(null);
    void (async () => {
      try {
        const nodex = window.Nodex;
        if (!nodex?.wpnListBacklinksToNote) {
          if (!cancelled) setBacklinks([]);
          return;
        }
        const { sources } = await nodex.wpnListBacklinksToNote(currentNote.id);
        if (!cancelled) setBacklinks(Array.isArray(sources) ? sources : []);
      } catch {
        if (!cancelled) {
          setBacklinkError("Could not load backlinks.");
          setBacklinks([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentNote?.id, isMarkdown]);

  if (!isMarkdown) {
    return (
      <div className="flex h-full min-h-0 flex-col p-3">
        <div className="text-[11px] font-medium text-muted-foreground">Outline</div>
        <div className="mt-2 text-[12px] text-muted-foreground">
          Open a markdown note to see its headings.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-2">
      <div className="px-1.5 py-1 text-[11px] font-medium text-muted-foreground">Outline</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="px-2 py-1 text-[12px] text-muted-foreground">No headings found.</div>
        ) : (
          <ul className="m-0 list-none p-0">
            {rows.map((r) => {
              const pad = Math.max(0, (r.level - 1) * 10);
              return (
                <li key={r.slug}>
                  <button
                    type="button"
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] text-foreground outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ paddingLeft: 8 + pad }}
                    title={r.text}
                    onClick={() => {
                      if (
                        tab?.instanceId &&
                        currentNote &&
                        tab.tabTypeId === SHELL_TAB_NOTE
                      ) {
                        tabs.updateTabPresentation(tab.instanceId, {
                          state: {
                            noteId: currentNote.id,
                            markdownHeadingSlug: r.slug,
                          },
                        });
                      }
                      window.dispatchEvent(
                        new CustomEvent("nodex:markdown-scroll-to-heading", {
                          detail: { noteId: currentNote!.id, slug: r.slug },
                        }),
                      );
                    }}
                  >
                    {r.text}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 shrink-0 border-t border-border px-1.5 pt-2">
        <div className="py-1 text-[11px] font-medium text-muted-foreground">Linked from</div>
        <div className="max-h-[200px] overflow-auto">
          {backlinkError ? (
            <div className="px-1 py-1 text-[11px] text-destructive">{backlinkError}</div>
          ) : backlinks.length === 0 ? (
            <div className="px-1 py-1 text-[12px] text-muted-foreground">No incoming links.</div>
          ) : (
            <ul className="m-0 list-none p-0">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className="w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] text-foreground outline-none hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring"
                    title={b.title}
                    onClick={() => openNoteById(b.id)}
                  >
                    {b.title.trim() || "Untitled"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
