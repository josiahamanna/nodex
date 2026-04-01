import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import NotesSidebarPanel from "../../../../components/NotesSidebarPanel";
import { useShellNavigation } from "../../../useShellNavigation";
import { useShellProjectWorkspace } from "../../../useShellProjectWorkspace";
import type { AppDispatch, RootState } from "../../../../store";
import { fetchAllNotes } from "../../../../store/notesSlice";
import type { ShellViewComponentProps } from "../../../views/ShellViewRegistry";
import { useNotesExplorerShellHandlers } from "./useNotesExplorerShellHandlers";

export function NotesExplorerPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const dispatch = useDispatch<AppDispatch>();
  const { openNoteById } = useShellNavigation();
  const { workspaceRoots, workspaceLabels } = useShellProjectWorkspace();
  const notesList = useSelector((s: RootState) => s.notes.notesList);
  const currentNoteId = useSelector((s: RootState) => s.notes.currentNote?.id);
  const [registeredTypes, setRegisteredTypes] = useState<string[]>([]);

  const { notesProps } = useNotesExplorerShellHandlers({
    openNoteById,
    workspaceRoots,
  });

  useEffect(() => {
    void window.Nodex.getSelectableNoteTypes().then((t) => {
      setRegisteredTypes(Array.isArray(t) ? t : []);
    });
  }, []);

  useEffect(() => {
    if (workspaceRoots.length === 0) {
      return;
    }
    void dispatch(fetchAllNotes());
  }, [dispatch, workspaceRoots]);

  if (workspaceRoots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[12px] text-muted-foreground">
        <p>No workspace open.</p>
        <p className="text-[11px]">Open a project in the host to list notes here.</p>
      </div>
    );
  }

  return (
    <NotesSidebarPanel
      notes={notesList}
      registeredTypes={registeredTypes}
      currentNoteId={currentNoteId}
      workspaceRoots={workspaceRoots}
      workspaceLabels={workspaceLabels}
      prefixNoteTitleWithType
      {...notesProps}
    />
  );
}
