import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import NoteViewer from "../../components/NoteViewer";
import { workspaceFolderPathForNote } from "../../../shared/note-workspace";
import type { AppDispatch, RootState } from "../../store";
import { fetchAllNotes, fetchNote, renameNote } from "../../store/notesSlice";
import { useShellRegistries } from "../registries/ShellRegistriesContext";
import { useShellActiveMainTab } from "../ShellActiveTabContext";
import { useShellProjectWorkspace } from "../useShellProjectWorkspace";
import type { ShellViewComponentProps } from "../views/ShellViewRegistry";
import { SHELL_TAB_NOTE } from "./shellWorkspaceIds";

type NoteTabState = { noteId?: string };

export function NoteEditorShellView(_props: ShellViewComponentProps): React.ReactElement {
  const tab = useShellActiveMainTab();
  const { tabs } = useShellRegistries();
  const dispatch = useDispatch<AppDispatch>();
  const currentNote = useSelector((s: RootState) => s.notes.currentNote);
  const detailLoading = useSelector((s: RootState) => s.notes.detailLoading);
  const error = useSelector((s: RootState) => s.notes.error);
  const { workspaceRoots } = useShellProjectWorkspace();

  const noteId =
    tab && typeof tab.state === "object" && tab.state !== null
      ? (tab.state as NoteTabState).noteId
      : undefined;

  useEffect(() => {
    if (noteId) {
      void dispatch(fetchNote(noteId));
    }
  }, [dispatch, noteId]);

  const assetProjectRoot =
    noteId && workspaceRoots.length > 0
      ? workspaceFolderPathForNote(noteId, workspaceRoots)
      : null;

  if (!noteId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-[12px] text-muted-foreground">
        No note selected.
      </div>
    );
  }

  if (error && !detailLoading && currentNote?.id !== noteId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-[12px] text-destructive">
        {error}
      </div>
    );
  }

  if (detailLoading && !currentNote) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-[12px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (currentNote?.id === noteId) {
    return (
      <NoteViewer
        note={currentNote}
        assetProjectRoot={assetProjectRoot}
        onTitleCommit={(title) => {
          void (async () => {
            const id = currentNote.id;
            await dispatch(renameNote({ id, title })).unwrap();
            await dispatch(fetchAllNotes());
            const tabInst = tabs.findNoteTabByNoteId(id, SHELL_TAB_NOTE);
            if (tabInst) {
              const label = title.replace(/\s+/g, " ").trim() || "Untitled";
              tabs.updateTabPresentation(tabInst.instanceId, { title: label });
            }
          })();
        }}
      />
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-[12px] text-muted-foreground">
      Loading…
    </div>
  );
}
