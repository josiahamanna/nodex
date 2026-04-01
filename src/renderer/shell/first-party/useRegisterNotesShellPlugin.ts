import { useEffect } from "react";
import { useNodexContributionRegistry } from "../NodexContributionContext";
import { useShellLayoutStore } from "../layout/ShellLayoutContext";
import { openNoteInShell } from "../openNoteInShell";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellViewRegistry } from "../views/ShellViewContext";
import { NoteEditorShellView } from "./NoteEditorShellView";
import {
  NOTES_EXPLORER_VIEW_SIDEBAR,
  SHELL_TAB_NOTE,
  SHELL_VIEW_NOTE_EDITOR,
} from "./shellWorkspaceIds";

const NOTES_SHELL_PLUGIN_ID = "shell.notes";

export function useRegisterNotesShellPlugin(): void {
  const regs = useShellRegistries();
  const views = useShellViewRegistry();
  const layout = useShellLayoutStore();
  const contrib = useNodexContributionRegistry();

  useEffect(() => {
    const disposers: Array<() => void> = [];

    disposers.push(
      views.registerView({
        id: SHELL_VIEW_NOTE_EDITOR,
        title: "Note",
        defaultRegion: "mainArea",
        component: NoteEditorShellView,
        capabilities: { allowedCommands: "allShellCommands", readContext: true },
      }),
    );

    disposers.push(
      regs.tabs.registerTabType({
        id: SHELL_TAB_NOTE,
        title: "Note",
        order: 12,
        viewId: SHELL_VIEW_NOTE_EDITOR,
        primarySidebarViewId: NOTES_EXPLORER_VIEW_SIDEBAR,
      }),
    );

    disposers.push(
      contrib.registerCommand({
        id: "nodex.notes.open",
        title: "Notes: Open note by id",
        category: "Notes",
        sourcePluginId: NOTES_SHELL_PLUGIN_ID,
        doc: "Opens a Nodex note in the shell main area (reuses tab per note).",
        api: {
          summary: "Open or focus a note tab for the given id.",
          args: [{ name: "noteId", type: "string", required: true, description: "Note id" }],
          exampleInvoke: { noteId: "<uuid>" },
          returns: { type: "void", description: "Opens sidebar explorer and note editor." },
        },
        handler: (args) => {
          const noteId =
            args && typeof (args as { noteId?: unknown }).noteId === "string"
              ? (args as { noteId: string }).noteId
              : undefined;
          if (!noteId?.trim()) {
            return;
          }
          openNoteInShell(noteId.trim(), { tabs: regs.tabs, views, layout });
        },
      }),
    );

    return () => {
      for (const d of disposers) d();
    };
  }, [contrib, layout, regs, views]);
}
