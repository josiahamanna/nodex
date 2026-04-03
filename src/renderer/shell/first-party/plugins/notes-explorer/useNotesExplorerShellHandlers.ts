import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type {
  CreateNoteRelation,
  NoteMovePlacement,
  PasteSubtreePayload,
} from "@nodex/ui-types";
import { workspaceFolderPathForNote } from "../../../../../shared/note-workspace";
import type { AppDispatch, RootState } from "../../../../store";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { closeShellTabsForNoteIds } from "../../../shellTabClose";
import {
  createNote,
  deleteNotesInTree,
  fetchAllNotes,
  fetchNote,
  moveNoteInTree,
  moveNotesBulkInTree,
  pasteSubtree,
  renameNote,
} from "../../../../store/notesSlice";

export function useNotesExplorerShellHandlers(opts: {
  openNoteById: (id: string, nav?: { markdownHeadingSlug?: string }) => void;
  workspaceRoots: string[];
}) {
  const { tabs } = useShellRegistries();
  const dispatch = useDispatch<AppDispatch>();
  const currentNoteId = useSelector((s: RootState) => s.notes.currentNote?.id);
  const [assetFsTick, setAssetFsTick] = useState(0);
  const bumpAssets = useCallback(() => setAssetFsTick((t) => t + 1), []);

  const onNoteSelect = useCallback(
    (id: string) => {
      opts.openNoteById(id);
    },
    [opts],
  );

  const onResyncNotes = useCallback(() => {
    void dispatch(fetchAllNotes());
  }, [dispatch]);

  const onCreateNote = useCallback(
    async (payload: {
      anchorId?: string;
      relation: CreateNoteRelation;
      type: string;
      content?: string;
      title?: string;
    }) => {
      await dispatch(createNote(payload)).unwrap();
      await dispatch(fetchAllNotes());
    },
    [dispatch],
  );

  const onRenameNote = useCallback(
    async (id: string, title: string) => {
      await dispatch(renameNote({ id, title })).unwrap();
      await dispatch(fetchAllNotes());
      if (currentNoteId === id) {
        await dispatch(fetchNote(id));
      }
    },
    [dispatch, currentNoteId],
  );

  const onMoveNote = useCallback(
    async (payload: {
      draggedId: string;
      targetId: string;
      placement: NoteMovePlacement;
    }) => {
      await dispatch(moveNoteInTree(payload)).unwrap();
      await dispatch(fetchAllNotes());
    },
    [dispatch],
  );

  const onMoveNotesBulk = useCallback(
    async (payload: {
      ids: string[];
      targetId: string;
      placement: NoteMovePlacement;
    }) => {
      await dispatch(moveNotesBulkInTree(payload)).unwrap();
      await dispatch(fetchAllNotes());
    },
    [dispatch],
  );

  const onDeleteNotes = useCallback(
    async (ids: string[]) => {
      await dispatch(deleteNotesInTree(ids)).unwrap();
      closeShellTabsForNoteIds(tabs, ids);
      await dispatch(fetchAllNotes());
    },
    [dispatch, tabs],
  );

  const onPasteSubtree = useCallback(
    async (p: PasteSubtreePayload) => {
      await dispatch(pasteSubtree(p)).unwrap();
      await dispatch(fetchAllNotes());
    },
    [dispatch],
  );

  const onAddWorkspaceFolder = useCallback(async () => {
    await window.Nodex.addWorkspaceFolder();
    void dispatch(fetchAllNotes());
    bumpAssets();
  }, [dispatch, bumpAssets]);

  const onRevealProjectFolder = useCallback(
    (noteId: string) => {
      const root = workspaceFolderPathForNote(noteId, opts.workspaceRoots);
      if (root) {
        void window.Nodex.revealProjectFolderInExplorer(root);
      }
    },
    [opts.workspaceRoots],
  );

  const onRefreshWorkspace = useCallback(async () => {
    await window.Nodex.refreshWorkspace();
    void dispatch(fetchAllNotes());
    bumpAssets();
  }, [dispatch, bumpAssets]);

  const onSwapWorkspaceBlock = useCallback(
    async (payload: { blockIndex: number; direction: "up" | "down" }) => {
      const r = await window.Nodex.swapWorkspaceBlock(payload);
      if (r.ok) {
        void dispatch(fetchAllNotes());
        bumpAssets();
      }
    },
    [dispatch, bumpAssets],
  );

  const onCommitWorkspaceFolderLabel = useCallback(
    async (rootPath: string, label: string | null) => {
      await window.Nodex.setWorkspaceFolderLabel(rootPath, label);
      bumpAssets();
    },
    [bumpAssets],
  );

  const onOpenProjectAsset = useCallback(
    (projectRoot: string, relativePath: string) => {
      void window.Nodex.openAssetExternal(relativePath, projectRoot);
    },
    [],
  );

  return {
    notesProps: {
      onNoteSelect,
      onCreateNote,
      onRenameNote,
      onMoveNote,
      onMoveNotesBulk,
      onDeleteNotes,
      onPasteSubtree,
      onAddWorkspaceFolder,
      onRevealProjectFolder,
      onRefreshWorkspace,
      onResyncNotes,
      onSwapWorkspaceBlock,
      onCommitWorkspaceFolderLabel,
      onOpenProjectAsset,
      assetFsTick,
    },
  };
}
