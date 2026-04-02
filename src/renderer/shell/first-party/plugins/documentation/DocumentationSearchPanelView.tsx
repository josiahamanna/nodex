import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { NoteListItem } from "@nodex/ui-types";
import { useNodexCommands } from "../../../NodexContributionContext";
import type { CommandContribution } from "../../../nodex-contribution-registry";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import type { AppDispatch, RootState } from "../../../../store";
import {
  createNote,
  fetchAllNotes,
  patchNoteMetadata,
  renameNote,
  saveNoteContent,
} from "../../../../store/notesSlice";
import { useShellLayoutStore } from "../../../layout/ShellLayoutContext";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../../../views/ShellViewContext";
import { openNoteInShell } from "../../../openNoteInShell";
import { DOCS_BC, type DocsBcMessage } from "./documentationConstants";
import { resolveCommandApiDoc } from "../../../command-api-metadata";
import { resolvedCommandDocToMarkdown } from "./documentationCommandMarkdown";
import { useShellProjectWorkspace } from "../../../useShellProjectWorkspace";

function esc(s: string): string {
  return String(s || "").replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] ?? ch),
  );
}

function isBundledDocPage(item: NoteListItem): boolean {
  const m = item.metadata;
  return m != null && m.bundledDoc === true && m.bundledDocRole === "page";
}

function isCommandDocNote(item: NoteListItem, commandId: string): boolean {
  const m = item.metadata as Record<string, unknown> | undefined;
  return (
    m != null &&
    m.docsKind === "command" &&
    m.docsCommandId === commandId &&
    item.type === "markdown"
  );
}

function bundledDocOrder(item: NoteListItem): number {
  const o = item.metadata?.bundledDocOrder;
  return typeof o === "number" ? o : 9999;
}

type SidebarMode = "guides" | "commands";

export function DocumentationSearchPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const commands = useNodexCommands();
  const notesList = useSelector((s: RootState) => s.notes.notesList);
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const layout = useShellLayoutStore();
  const { mountKind } = useShellProjectWorkspace();
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("guides");
  const [q, setQ] = useState("");
  const [miniOnly, setMiniOnly] = useState(true);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [wpnGuides, setWpnGuides] = useState<Array<{ id: string; title: string }>>([]);
  const [wpnGuidesError, setWpnGuidesError] = useState<string | null>(null);

  const postBc = useCallback((msg: DocsBcMessage) => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(DOCS_BC);
    bc.postMessage(msg);
    bc.close();
  }, []);

  useEffect(() => {
    // Legacy notes list (folder-backed / bundled docs in SQLite notes tree)
    if (mountKind === "wpn-postgres") {
      return;
    }
    void dispatch(fetchAllNotes());
  }, [dispatch, mountKind]);

  useEffect(() => {
    if (mountKind !== "wpn-postgres") {
      setWpnGuides([]);
      setWpnGuidesError(null);
      return;
    }
    let cancelled = false;
    setWpnGuidesError(null);
    void (async () => {
      try {
        const { workspaces } = await window.Nodex.wpnListWorkspaces();
        const ws0 = workspaces[0];
        if (!ws0) {
          if (!cancelled) setWpnGuides([]);
          return;
        }
        const { projects } = await window.Nodex.wpnListProjects(ws0.id);
        const docsProject = projects.find((p) => p.name === "Documentation");
        if (!docsProject) {
          if (!cancelled) setWpnGuides([]);
          return;
        }
        const { notes } = await window.Nodex.wpnListNotes(docsProject.id);
        // Fetch details for each note so we can filter bundledDocRole/pages.
        const details = await Promise.all(
          notes.map(async (n) => {
            try {
              const r = await window.Nodex.wpnGetNote(n.id);
              return r.note;
            } catch {
              return null;
            }
          }),
        );
        const pages = details
          .filter((n): n is NonNullable<typeof n> => !!n)
          .filter((n) => n.metadata?.bundledDoc === true && n.metadata?.bundledDocRole === "page")
          .map((n) => ({ id: n.id, title: n.title }));
        // Stable ordering using bundledDocOrder when present.
        pages.sort((a, b) => {
          const ao = (details.find((x) => x?.id === a.id)?.metadata as Record<string, unknown> | undefined)
            ?.bundledDocOrder;
          const bo = (details.find((x) => x?.id === b.id)?.metadata as Record<string, unknown> | undefined)
            ?.bundledDocOrder;
          const an = typeof ao === "number" ? ao : 9999;
          const bn = typeof bo === "number" ? bo : 9999;
          if (an !== bn) return an - bn;
          return a.title.localeCompare(b.title);
        });
        if (!cancelled) setWpnGuides(pages);
      } catch (e) {
        if (!cancelled) {
          setWpnGuides([]);
          setWpnGuidesError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mountKind]);

  useEffect(() => {
    const bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DOCS_BC) : null;
    if (!bc) return () => {};
    const onMsg = (ev: MessageEvent<DocsBcMessage>) => {
      const d = ev.data;
      if (d?.type === "docs.setMiniOnly" && typeof d.miniOnly === "boolean") {
        setMiniOnly(d.miniOnly);
      }
    };
    bc.addEventListener("message", onMsg);
    return () => {
      bc.removeEventListener("message", onMsg);
      bc.close();
    };
  }, []);

  const guideRows = useMemo(() => {
    if (mountKind === "wpn-postgres") {
      return wpnGuides.map((g) => ({
        id: g.id,
        title: g.title,
        type: "markdown",
        parentId: null,
        depth: 0,
        metadata: { bundledDoc: true, bundledDocRole: "page" },
      })) as NoteListItem[];
    }
    return notesList
      .filter(isBundledDocPage)
      .sort((a, b) => {
        const ao = bundledDocOrder(a);
        const bo = bundledDocOrder(b);
        if (ao !== bo) return ao - bo;
        return String(a.title).localeCompare(String(b.title));
      });
  }, [notesList]);

  const norm = (s: string) => String(s || "").toLowerCase().trim();
  const label = (c: CommandContribution) =>
    c.category ? `${c.category}: ${c.title}` : c.title;
  const matchesCommand = (c: CommandContribution, query: string) => {
    if (!query) return true;
    const argText =
      c.api?.args?.map((a) => `${a.name} ${a.type} ${a.description ?? ""}`).join(" ") ?? "";
    const h = norm(
      `${c.id} ${label(c)} ${c.doc || ""} ${c.sourcePluginId ?? ""} ${c.api?.summary ?? ""} ${c.api?.details ?? ""} ${argText}`,
    );
    return query
      .split(/\s+/)
      .filter(Boolean)
      .every((p) => h.includes(p));
  };

  const filteredCommands = commands
    .filter((c) => !miniOnly || c.miniBar !== false)
    .filter((c) => matchesCommand(c, norm(q)))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const filteredGuides = guideRows.filter((g) => {
    if (!norm(q)) return true;
    const h = norm(`${g.id} ${g.title}`);
    return norm(q)
      .split(/\s+/)
      .filter(Boolean)
      .every((p) => h.includes(p));
  });

  const selectedCommand = selectedCommandId ? commands.find((x) => x.id === selectedCommandId) : null;

  const openNote = useCallback(
    (noteId: string) => {
      openNoteInShell(noteId, { tabs: regs.tabs, views, layout });
    },
    [layout, regs.tabs, views],
  );

  const ensureCommandDocNote = useCallback(
    async (c: CommandContribution): Promise<string> => {
      const existing = notesList.find((n) => isCommandDocNote(n, c.id));
      const md = resolvedCommandDocToMarkdown(resolveCommandApiDoc(c));
      const metaPatch = {
        docsKind: "command",
        docsCommandId: c.id,
        docsReadOnly: true,
        markdownViewMode: "preview",
      } as const;

      if (existing) {
        await dispatch(renameNote({ id: existing.id, title: c.id })).unwrap();
        await dispatch(saveNoteContent({ noteId: existing.id, content: md })).unwrap();
        await dispatch(patchNoteMetadata({ noteId: existing.id, patch: metaPatch as unknown as Record<string, unknown> })).unwrap();
        return existing.id;
      }

      const created = await dispatch(
        createNote({
          relation: "root",
          type: "markdown",
          title: c.id,
          content: md,
        }),
      ).unwrap();
      const newId = created.id;
      await dispatch(patchNoteMetadata({ noteId: newId, patch: metaPatch as unknown as Record<string, unknown> })).unwrap();
      await dispatch(fetchAllNotes()).unwrap();
      return newId;
    },
    [dispatch, notesList],
  );

  return (
    <div className="flex h-full min-h-0 flex-col text-[12px]">
      <div className="flex shrink-0 border-b border-border">
        <button
          type="button"
          className={`flex-1 px-2 py-2 text-center text-[11px] font-semibold ${
            sidebarMode === "guides" ? "bg-muted/40 text-foreground" : "text-muted-foreground hover:bg-muted/20"
          }`}
          onClick={() => {
            setSidebarMode("guides");
            setQ("");
          }}
        >
          Guides
        </button>
        <button
          type="button"
          className={`flex-1 px-2 py-2 text-center text-[11px] font-semibold ${
            sidebarMode === "commands" ? "bg-muted/40 text-foreground" : "text-muted-foreground hover:bg-muted/20"
          }`}
          onClick={() => {
            setSidebarMode("commands");
            setQ("");
          }}
        >
          Commands
        </button>
      </div>

      {sidebarMode === "guides" ? (
        <>
          <div className="shrink-0 border-b border-border px-2.5 py-2 text-[12px] font-bold opacity-85">
            Bundled documentation
          </div>
          <input
            className="mx-2.5 mt-2 box-border w-[calc(100%-20px)] border border-border px-2.5 py-2 text-[12px] outline-none"
            placeholder="Filter guides by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[11px] opacity-65">
            <span>{filteredGuides.length} guide(s)</span>
            <button
              type="button"
              className="rounded border border-border bg-muted/20 px-2 py-1 text-[10px]"
              onClick={() => postBc({ type: "docs.refreshCommands" })}
            >
              Refresh panels
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2">
            {guideRows.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-muted-foreground">
                {mountKind === "wpn-postgres"
                  ? wpnGuidesError
                    ? `Could not load guides from Postgres: ${wpnGuidesError}`
                    : "No bundled guides found in the server workspace yet."
                  : "No bundled guides in the notes database yet. Open a workspace so bundled docs can seed, then switch back here."}
              </p>
            ) : (
              filteredGuides.slice(0, 200).map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="w-full border border-border/80 bg-muted/10 px-2 py-1.5 text-left hover:bg-muted/40"
                  onClick={() => {
                    setSelectedGuideId(g.id);
                    if (mountKind === "wpn-postgres") {
                      // In WPN mode, bundled docs are WPN notes; open directly.
                      openNote(g.id);
                      return;
                    }
                    void dispatch(
                      patchNoteMetadata({
                        noteId: g.id,
                        patch: { docsReadOnly: true, markdownViewMode: "preview" },
                      }),
                    );
                    openNote(g.id);
                  }}
                >
                  <div className="text-[11px] font-medium text-foreground">{esc(g.title)}</div>
                  <div className="font-mono text-[10px] opacity-70">{esc(g.id)}</div>
                </button>
              ))
            )}
          </div>
          {selectedGuideId ? (
            <div className="shrink-0 border-t border-border bg-muted/10 p-2.5 text-[11px] text-muted-foreground">
              <span className="font-mono text-[10px] text-foreground">{esc(selectedGuideId)}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>Read-only view in the primary column →</span>
            </div>
          ) : (
            <div className="shrink-0 border-t border-border p-2 text-[11px] opacity-50">
              Select a guide (rendered markdown, read-only)
            </div>
          )}
        </>
      ) : (
        <>
          <div className="shrink-0 border-b border-border px-2.5 py-2 text-[12px] font-bold opacity-85">
            Search commands
          </div>
          <input
            className="mx-2.5 mt-2 box-border w-[calc(100%-20px)] border border-border px-2.5 py-2 text-[12px] outline-none"
            placeholder="Filter by id, title, doc…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 text-[11px] opacity-65">
            <span>{filteredCommands.length} match(es)</span>
            <button
              type="button"
              className="rounded border border-border bg-muted/20 px-2 py-1 text-[10px]"
              onClick={() => postBc({ type: "docs.refreshCommands" })}
            >
              Refresh other panels
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto px-2 pb-2">
            {filteredCommands.slice(0, 300).map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full border border-border/80 bg-muted/10 px-2 py-1.5 text-left hover:bg-muted/40"
                onClick={() => {
                  setSelectedCommandId(c.id);
                  void (async () => {
                    const noteId = await ensureCommandDocNote(c);
                    openNote(noteId);
                  })();
                }}
              >
                <div className="font-mono text-[10px]">{esc(c.id)}</div>
                <div className="text-[11px] opacity-80">{esc(label(c))}</div>
              </button>
            ))}
          </div>
          {selectedCommand ? (
            <div className="shrink-0 border-t border-border bg-muted/10 p-2.5 text-[11px] text-muted-foreground">
              <span className="font-mono text-[10px] text-foreground">{esc(selectedCommand.id)}</span>
              <span className="mx-1 opacity-40">·</span>
              <span>Full text is in the primary area →</span>
            </div>
          ) : (
            <div className="shrink-0 border-t border-border p-2 text-[11px] opacity-50">
              Select a command (details open in the primary column)
            </div>
          )}
        </>
      )}
    </div>
  );
}
