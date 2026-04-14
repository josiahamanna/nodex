import { getNodex } from "../../../../../shared/nodex-host-access";
import { wpnTrace } from "../../../../../shared/wpn-debug-trace";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import type {
  CreateNoteRelation,
  NoteMovePlacement,
} from "@nodex/ui-types";
import { wpnComputeChildMapAfterMove } from "../../../../../core/wpn/wpn-note-move";
import type { WpnNoteRow } from "../../../../../core/wpn/wpn-types";
import type { WpnNoteListItem, WpnProjectRow, WpnWorkspaceRow } from "../../../../../shared/wpn-v2-types";
import type { AppDispatch, RootState } from "../../../../store";
import { useAuth } from "../../../../auth/AuthContext";
import { clearNoteTitleDraft, fetchNote, setNoteTitleDraft } from "../../../../store/notesSlice";
import {
  fetchHeadlessWpnSession,
  isElectronUserAgent,
  NODEX_WEB_PLUGINS_CHANGED,
  syncWpnNotesBackend,
} from "../../../../nodex-web-shim";
import {
  getRegisteredTypesCached,
  getSelectableNoteTypesCached,
  invalidateNodexNoteTypesCaches,
} from "../../../../utils/cached-nodex-note-types";
import { useShellRegistries } from "../../../registries/ShellRegistriesContext";
import { closeShellTabsForNoteIds } from "../../../shellTabClose";
import { useShellNavigation } from "../../../useShellNavigation";
import { useShellProjectWorkspace } from "../../../useShellProjectWorkspace";
import { rememberWpnProjectIdForScratch } from "../../../wpnScratchProject";
import {
  NODEX_WPN_TREE_CHANGED_EVENT,
  WPN_SYNC_REMOTE_POLL_INTERVAL_MS,
} from "./wpnExplorerEvents";
import { NODEX_SHELL_NOTE_TAB_CLOSED_EVENT } from "../../../shellTabUrlSync";
import { SHELL_TAB_NOTE, SHELL_TAB_SCRATCH_MARKDOWN } from "../../shellWorkspaceIds";
import { InlineSingleLineEditable } from "../../../../components/InlineSingleLineEditable";
import { dropAllowedOne, placementFromPointer } from "../../../../notes-sidebar/notes-sidebar-panel-dnd";
import {
  runWpnNoteTitleRenameWithVfsDependentsFlow,
  useVfsDependentTitleRenameChoice,
} from "../../../wpn/vfsDependentTitleRenameChoice";
import {
  canonicalVfsPathFromLinkRow,
  displayWpnNotePathParts,
} from "../../../../../shared/note-vfs-path";
import { useToast } from "../../../../toast/ToastContext";

type ShellViewComponentProps = {
  viewId: string;
  title: string;
};

const DND_NOTE_MIME = "application/nodex-wpn-note";

const NOTE_OPEN_DELAY_MS = 260;

function explorerCanonicalVfsPath(
  projectId: string,
  noteTitle: string,
  workspaces: WpnWorkspaceRow[],
  projectsByWs: Record<string, WpnProjectRow[]>,
): string | undefined {
  for (const w of workspaces) {
    const projs = projectsByWs[w.id] ?? [];
    const p = projs.find((x) => x.id === projectId);
    if (p) {
      return canonicalVfsPathFromLinkRow({
        workspaceName: w.name,
        projectName: p.name,
        title: noteTitle,
      });
    }
  }
  return undefined;
}

function explorerDisplayWpnNotePath(
  projectId: string,
  noteTitle: string,
  workspaces: WpnWorkspaceRow[],
  projectsByWs: Record<string, WpnProjectRow[]>,
): string | undefined {
  for (const w of workspaces) {
    const projs = projectsByWs[w.id] ?? [];
    const p = projs.find((x) => x.id === projectId);
    if (p) {
      return displayWpnNotePathParts(w.name, p.name, noteTitle);
    }
  }
  return undefined;
}

function preorderIndex(notes: WpnNoteListItem[], id: string): number {
  return notes.findIndex((x) => x.id === id);
}

function prevSiblingSameDepth(notes: WpnNoteListItem[], id: string): WpnNoteListItem | null {
  const n = notes.find((x) => x.id === id);
  if (!n) return null;
  const i = preorderIndex(notes, id);
  for (let j = i - 1; j >= 0; j--) {
    const o = notes[j]!;
    if (o.depth < n.depth) break;
    if (o.depth === n.depth && o.parent_id === n.parent_id) return o;
  }
  return null;
}

function nextSiblingSameDepth(notes: WpnNoteListItem[], id: string): WpnNoteListItem | null {
  const n = notes.find((x) => x.id === id);
  if (!n) return null;
  const i = preorderIndex(notes, id);
  let j = i + 1;
  while (j < notes.length && notes[j]!.depth > n.depth) j++;
  if (j >= notes.length) return null;
  const o = notes[j]!;
  if (o.depth === n.depth && o.parent_id === n.parent_id) return o;
  return null;
}

function isStrictDescendantOf(notes: WpnNoteListItem[], ancestorId: string, nodeId: string): boolean {
  let cur: string | null | undefined = notes.find((x) => x.id === nodeId)?.parent_id ?? undefined;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = notes.find((x) => x.id === cur)?.parent_id ?? null;
  }
  return false;
}

function rootIdsInPreorder(notes: WpnNoteListItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of notes) {
    if (n.parent_id !== null) continue;
    if (!seen.has(n.id)) {
      seen.add(n.id);
      out.push(n.id);
    }
  }
  return out;
}

/** Parent folder ids that must be expanded for `noteId` to be visible in the tree. */
function collectAncestorNoteIds(noteId: string, parentMap: Map<string, string | null>): string[] {
  const out: string[] = [];
  let cur = parentMap.get(noteId) ?? null;
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    out.push(cur);
    cur = parentMap.get(cur) ?? null;
  }
  return out;
}

function mergeWpnExpandedNoteParents(
  prev: Set<string>,
  serverExpandedIds: string[],
  noteIds: Set<string>,
): Set<string> {
  const merged = new Set([...prev].filter((id) => noteIds.has(id)));
  for (const id of serverExpandedIds) {
    if (noteIds.has(id)) merged.add(id);
  }
  return merged;
}

function optimisticWpnNotesAfterMove(
  items: WpnNoteListItem[],
  draggedId: string,
  targetId: string,
  placement: NoteMovePlacement,
): WpnNoteListItem[] | null {
  try {
    const rows: WpnNoteRow[] = items.map((n) => ({
      id: n.id,
      project_id: n.project_id,
      parent_id: n.parent_id,
      type: n.type,
      title: n.title,
      content: "",
      metadata_json: null,
      sibling_index: n.sibling_index,
      created_at_ms: 0,
      updated_at_ms: 0,
    }));
    const childMap = wpnComputeChildMapAfterMove(rows, draggedId, targetId, placement);
    const byId = new Map(items.map((n) => [n.id, n]));
    const out: WpnNoteListItem[] = [];
    const visit = (parentId: string | null, depth: number): void => {
      const kids = childMap.get(parentId) ?? [];
      for (let i = 0; i < kids.length; i++) {
        const id = kids[i]!;
        const src = byId.get(id);
        if (!src) continue;
        out.push({
          ...src,
          parent_id: parentId,
          depth,
          sibling_index: i,
        });
        visit(id, depth + 1);
      }
    };
    visit(null, 0);
    return out;
  } catch {
    return null;
  }
}

function buildChildMapFromExplorerItems(items: WpnNoteListItem[]): Map<string | null, string[]> {
  const m = new Map<string | null, string[]>();
  for (const n of items) {
    const k = n.parent_id;
    const arr = m.get(k) ?? [];
    arr.push(n.id);
    m.set(k, arr);
  }
  const byId = new Map(items.map((n) => [n.id, n]));
  for (const [, arr] of m) {
    arr.sort((a, b) => (byId.get(a)?.sibling_index ?? 0) - (byId.get(b)?.sibling_index ?? 0));
  }
  return m;
}

function flattenExplorerChildMapToListItems(
  childMap: Map<string | null, string[]>,
  items: WpnNoteListItem[],
  synthetic: { id: string; project_id: string; type: string; title: string },
): WpnNoteListItem[] {
  const byId = new Map(items.map((n) => [n.id, n]));
  const out: WpnNoteListItem[] = [];
  const visit = (parentId: string | null, depth: number): void => {
    const kids = childMap.get(parentId) ?? [];
    for (let i = 0; i < kids.length; i++) {
      const nid = kids[i]!;
      if (nid === synthetic.id) {
        out.push({
          id: synthetic.id,
          project_id: synthetic.project_id,
          parent_id: parentId,
          type: synthetic.type,
          title: synthetic.title,
          depth,
          sibling_index: i,
        });
        visit(nid, depth + 1);
      } else {
        const src = byId.get(nid);
        if (!src) continue;
        out.push({
          ...src,
          parent_id: parentId,
          depth,
          sibling_index: i,
        });
        visit(nid, depth + 1);
      }
    }
  };
  visit(null, 0);
  return out;
}

/**
 * Inserts a synthetic row matching {@link wpnJsonCreateNote} placement (root / child / sibling).
 */
function optimisticWpnNotesAfterCreate(
  items: WpnNoteListItem[],
  params: {
    newId: string;
    projectId: string;
    relation: CreateNoteRelation;
    anchorId?: string;
    type: string;
  },
): WpnNoteListItem[] | null {
  try {
    if (items.some((n) => n.id === params.newId)) return null;
    const { newId, projectId, relation, anchorId, type } = params;
    const base = buildChildMapFromExplorerItems(items);
    const cm = new Map<string | null, string[]>();
    for (const [k, v] of base) {
      cm.set(k, [...v]);
    }

    if (relation === "root") {
      const roots = [...(cm.get(null) ?? [])];
      cm.set(null, [...roots, newId]);
    } else if (!anchorId) {
      return null;
    } else if (relation === "child") {
      const kids = [...(cm.get(anchorId) ?? [])];
      cm.set(anchorId, [...kids, newId]);
    } else {
      const anchor = items.find((x) => x.id === anchorId);
      if (!anchor) return null;
      const parentKey = anchor.parent_id;
      const sibs = [...(cm.get(parentKey) ?? [])];
      const ai = sibs.indexOf(anchorId);
      if (ai < 0) return null;
      cm.set(parentKey, [...sibs.slice(0, ai + 1), newId, ...sibs.slice(ai + 1)]);
    }

    return flattenExplorerChildMapToListItems(cm, items, {
      id: newId,
      project_id: projectId,
      type,
      title: "Untitled",
    });
  } catch {
    return null;
  }
}

/** Short badge for explorer rows: two letters, e.g. markdown → md, foo-bar → fb. */
function noteTypeExplorerAbbrev(type: string): string {
  const key = type.toLowerCase().trim();
  if (!key) return "??";

  const overrides: Record<string, string> = {
    // "md" is the usual shorthand; first two letters would be "ma".
    markdown: "md",
    // "mdx" would otherwise slice to "md" and collide with markdown.
    mdx: "mx",
  };
  const fromOverride = overrides[key];
  if (fromOverride) return fromOverride;

  const parts = key.split(/[-_]+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "?";
    const b = parts[1]![0] ?? "?";
    return `${a}${b}`;
  }
  const word = parts[0] ?? key;
  if (word.length >= 2) return word.slice(0, 2);
  return (word[0] ?? "?").repeat(2);
}

type NoteClipboard = { op: "cut" | "copy"; projectId: string; noteId: string };

type MenuState =
  | {
      x: number;
      y: number;
      kind: "ws" | "project" | "note" | "projectBody" | "no_project" | "panel_empty";
      id: string;
      workspaceId?: string;
      projectId?: string;
    }
  | null;

type TypePickerState = {
  x: number;
  y: number;
  projectId: string;
  relation: CreateNoteRelation;
  anchorId?: string;
} | null;

type RenamingState =
  | {
      kind: "ws" | "project" | "note";
      id: string;
      workspaceId?: string;
      projectId?: string;
      draft: string;
    }
  | null;

export function WpnExplorerPanelView(_props: ShellViewComponentProps): React.ReactElement {
  const { openWebAuth } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { tabs } = useShellRegistries();
  const { openNoteById } = useShellNavigation();
  const { showToast } = useToast();
  const { workspaceRoots, rootPath } = useShellProjectWorkspace();
  const currentNoteId = useSelector((s: RootState) => s.notes.currentNote?.id);
  const noteRenameEpoch = useSelector((s: RootState) => s.notes.noteRenameEpoch);
  const noteTitleDraftById = useSelector((s: RootState) => s.notes.noteTitleDraftById);

  const showFolderBasedWorkspaceCreate = isElectronUserAgent() || rootPath != null;

  const [workspaces, setWorkspaces] = useState<WpnWorkspaceRow[]>([]);
  /** Latest rows for {@link loadWorkspaces} merge logic without widening `loadWorkspaces` deps. */
  const workspacesRef = useRef<WpnWorkspaceRow[]>([]);
  workspacesRef.current = workspaces;
  const [projectsByWs, setProjectsByWs] = useState<Record<string, WpnProjectRow[]>>({});
  const projectsByWsRef = useRef<Record<string, WpnProjectRow[]>>({});
  projectsByWsRef.current = projectsByWs;
  const [expandedWs, setExpandedWs] = useState<Set<string>>(() => new Set());
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const selectedProjectIdRef = useRef<string | null>(null);
  selectedProjectIdRef.current = selectedProjectId;
  const [notes, setNotes] = useState<WpnNoteListItem[]>([]);
  const [expandedNoteParents, setExpandedNoteParents] = useState<Set<string>>(() => new Set());
  const [selectableTypes, setSelectableTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRefreshingExplorer, setIsRefreshingExplorer] = useState(false);
  const [wpnNoteDropHint, setWpnNoteDropHint] = useState<{
    targetId: string;
    placement: NoteMovePlacement;
  } | null>(null);
  const [wpnOwnerLabel, setWpnOwnerLabel] = useState<string | null>(null);

  const [menu, setMenu] = useState<MenuState>(null);
  const [typePicker, setTypePicker] = useState<TypePickerState>(null);
  const [renaming, setRenaming] = useState<RenamingState>(null);
  const vfsRenameChoice = useVfsDependentTitleRenameChoice();
  const noteClipboardRef = useRef<NoteClipboard | null>(null);
  const explorerNoteDragRef = useRef<{ projectId: string; noteId: string } | null>(null);
  const noteOpenTimerRef = useRef<number | null>(null);
  const pendingOpenNoteIdRef = useRef<string | null>(null);
  const explorerScrollRef = useRef<HTMLDivElement | null>(null);
  const lastExplorerRevealForNoteIdRef = useRef<string | null>(null);
  const notesRef = useRef<WpnNoteListItem[]>([]);
  /**
   * Prefetched notes/explorer-state for every project from the last full-tree load.
   * Used by the project-selection effect to render the tree synchronously instead of
   * firing another round trip. `null` = no prefetch available; treat as cache miss.
   */
  const fullTreeCacheRef = useRef<{
    notesByProjectId: Record<string, WpnNoteListItem[]>;
    explorerStateByProjectId: Record<string, { expanded_ids: string[] }>;
  } | null>(null);
  const [, bumpClip] = useState(0);

  const projectOpen = workspaceRoots.length > 0;

  notesRef.current = notes;

  const loadWorkspaces = useCallback(
    async (opts?: { force?: boolean; manageBusy?: boolean }) => {
      /**
       * Without `force`, skip while `projectOpen` is false so we do not hit WPN before the shell
       * reports a virtual root. After Scratch auto-provisions WPN, {@link dispatchWpnTreeChanged}
       * may run before the first `getProjectState` tick completes — `force` still loads so the tree
       * appears without a full page refresh.
       *
       * Busy loads (first paint, refresh, tree-change event) use `/wpn/full-tree`, so all note
       * titles + explorer state arrive in one round trip. The project-selection effect can then
       * render synchronously from `fullTreeCacheRef` without another RTT.
       *
       * Non-busy polls (8s background refresh) use the lighter `/wpn/workspaces-and-projects` to
       * keep the WS/project list fresh; notes for the active project are re-polled separately.
       */
      if (!opts?.force && !projectOpen) {
        wpnTrace("loadWorkspaces.bail", { reason: "!projectOpen && !force", manageBusy: opts?.manageBusy });
        return;
      }
      const prevWorkspaceIds = new Set(workspacesRef.current.map((w) => w.id));
      const manageBusy = opts?.manageBusy !== false;
      if (manageBusy) setBusy(true);
      try {
        let ws: WpnWorkspaceRow[];
        let allProjects: WpnProjectRow[];
        if (manageBusy) {
          wpnTrace("loadWorkspaces.branch", { via: "wpnGetFullTree" });
          const tree = await getNodex().wpnGetFullTree();
          ws = tree.workspaces;
          allProjects = tree.projects;
          fullTreeCacheRef.current = {
            notesByProjectId: tree.notesByProjectId,
            explorerStateByProjectId: tree.explorerStateByProjectId,
          };
        } else {
          wpnTrace("loadWorkspaces.branch", { via: "wpnListWorkspacesAndProjects" });
          const r = await getNodex().wpnListWorkspacesAndProjects();
          ws = r.workspaces;
          allProjects = r.projects;
        }
        wpnTrace("loadWorkspaces.result", { workspaces: ws.length, projects: allProjects.length });
        setWorkspaces(ws);
        const nextProj: Record<string, WpnProjectRow[]> = {};
        for (const w of ws) {
          // Bundled plugin docs live in a dedicated project; browse them from Documentation, not Notes explorer.
          nextProj[w.id] = allProjects.filter(
            (p) => p.workspace_id === w.id && p.name !== "Documentation",
          );
        }
        setProjectsByWs(nextProj);
        setSelectedProjectId((prev) => {
          if (!prev) return prev;
          const visible = Object.values(nextProj).some((arr) => arr.some((p) => p.id === prev));
          return visible ? prev : null;
        });
        setExpandedWs((prevExpanded) => {
          const out = new Set<string>();
          for (const w of ws) {
            if (!prevWorkspaceIds.has(w.id)) {
              out.add(w.id);
            } else if (prevExpanded.has(w.id)) {
              out.add(w.id);
            }
          }
          return out;
        });
      } finally {
        if (manageBusy) setBusy(false);
      }
    },
    [projectOpen],
  );

  useEffect(() => {
    rememberWpnProjectIdForScratch(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    const refresh = (invalidateCaches: boolean): void => {
      void (async () => {
        if (invalidateCaches) {
          invalidateNodexNoteTypesCaches();
        }
        const [registered, selectable] = await Promise.all([
          getRegisteredTypesCached(),
          getSelectableNoteTypesCached(),
        ]);
        const reg = new Set(Array.isArray(registered) ? registered : []);
        const sel = Array.isArray(selectable) ? selectable : [];
        // Only show types that are both selectable and actually registered (installed/loaded).
        // Also hide internal "root" (created implicitly; not user-selectable as a type).
        setSelectableTypes(sel.filter((t) => t !== "root" && reg.has(t)));
      })();
    };
    refresh(false);
    const onWebPlugins = (): void => {
      refresh(true);
    };
    window.addEventListener(NODEX_WEB_PLUGINS_CHANGED, onWebPlugins);
    const offMain = getNodex().onPluginsChanged(() => refresh(true));
    return () => {
      window.removeEventListener(NODEX_WEB_PLUGINS_CHANGED, onWebPlugins);
      offMain();
    };
  }, []);

  useEffect(() => {
    if (!projectOpen) {
      setWpnOwnerLabel(null);
      return;
    }
    let cancelled = false;
    void fetchHeadlessWpnSession().then((s) => {
      if (cancelled) return;
      setWpnOwnerLabel(s?.wpnOwnerId ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [projectOpen]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    const onWpnTreeChanged = (): void => {
      void loadWorkspaces({ force: true });
    };
    window.addEventListener(NODEX_WPN_TREE_CHANGED_EVENT, onWpnTreeChanged);
    return () => window.removeEventListener(NODEX_WPN_TREE_CHANGED_EVENT, onWpnTreeChanged);
  }, [loadWorkspaces]);

  useEffect(() => {
    if (!projectOpen || !syncWpnNotesBackend()) return;
    const id = window.setInterval(() => {
      void loadWorkspaces({ manageBusy: false });
    }, WPN_SYNC_REMOTE_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [projectOpen, loadWorkspaces]);

  const loadProjectTree = useCallback(async (projectId: string) => {
    const [{ notes: n }, { expanded_ids }] = await Promise.all([
      getNodex().wpnListNotes(projectId),
      getNodex().wpnGetExplorerState(projectId),
    ]);
    if (selectedProjectIdRef.current !== projectId) return;
    const noteIds = new Set(n.map((x) => x.id));
    setNotes(n);
    setExpandedNoteParents((prev) =>
      mergeWpnExpandedNoteParents(prev, expanded_ids, noteIds),
    );
  }, []);

  const refreshProjectNotesFromServer = useCallback(async (projectId: string) => {
    try {
      const { notes: n } = await getNodex().wpnListNotes(projectId);
      if (selectedProjectIdRef.current !== projectId) return;
      setNotes(n);
    } catch {
      /* offline or WPN unavailable */
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId || !projectOpen || !syncWpnNotesBackend()) return;
    const id = window.setInterval(() => {
      void refreshProjectNotesFromServer(selectedProjectId);
    }, WPN_SYNC_REMOTE_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [selectedProjectId, projectOpen, refreshProjectNotesFromServer]);

  useEffect(() => {
    if (!selectedProjectId || !projectOpen) return;
    // Prefer the prefetched full-tree snapshot so the explorer renders without a second RTT.
    // Consume once so a later external rename or poll still falls through to a fresh fetch.
    const cache = fullTreeCacheRef.current;
    const cachedNotes = cache?.notesByProjectId[selectedProjectId];
    const cachedExpanded = cache?.explorerStateByProjectId[selectedProjectId]?.expanded_ids;
    if (cachedNotes && cachedExpanded !== undefined) {
      const noteIds = new Set(cachedNotes.map((x) => x.id));
      setNotes(cachedNotes);
      setExpandedNoteParents((prev) =>
        mergeWpnExpandedNoteParents(prev, cachedExpanded, noteIds),
      );
      if (cache) {
        delete cache.notesByProjectId[selectedProjectId];
        delete cache.explorerStateByProjectId[selectedProjectId];
      }
      return;
    }
    setNotes([]);
    setExpandedNoteParents(new Set());
    void loadProjectTree(selectedProjectId);
  }, [selectedProjectId, projectOpen, loadProjectTree]);

  useEffect(() => {
    if (noteRenameEpoch === 0 || !projectOpen) return;
    const projectId = selectedProjectIdRef.current;
    if (!projectId) return;
    lastExplorerRevealForNoteIdRef.current = null;
    void loadProjectTree(projectId);
  }, [noteRenameEpoch, projectOpen, loadProjectTree]);

  useEffect(() => {
    if (selectedProjectId) return;
    setNotes([]);
    setExpandedNoteParents(new Set());
  }, [selectedProjectId]);

  useEffect(() => {
    return () => {
      if (noteOpenTimerRef.current != null) window.clearTimeout(noteOpenTimerRef.current);
      pendingOpenNoteIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onNoteTabClosed = (e: Event): void => {
      const ce = e as CustomEvent<{ noteId?: string }>;
      const nid = ce.detail?.noteId;
      if (typeof nid !== "string") return;
      if (pendingOpenNoteIdRef.current !== nid) return;
      if (noteOpenTimerRef.current != null) {
        window.clearTimeout(noteOpenTimerRef.current);
        noteOpenTimerRef.current = null;
      }
      pendingOpenNoteIdRef.current = null;
    };
    window.addEventListener(NODEX_SHELL_NOTE_TAB_CLOSED_EVENT, onNoteTabClosed);
    return () => window.removeEventListener(NODEX_SHELL_NOTE_TAB_CLOSED_EVENT, onNoteTabClosed);
  }, []);

  const persistExpandedNotes = useCallback(
    async (projectId: string, next: Set<string>) => {
      setExpandedNoteParents(next);
      await getNodex().wpnSetExplorerState(projectId, [...next]);
    },
    [],
  );

  const performWpnNoteMove = useCallback(
    async (projectId: string, draggedId: string, targetId: string, placement: NoteMovePlacement) => {
      const snapshot = notesRef.current;
      const optimistic = optimisticWpnNotesAfterMove(snapshot, draggedId, targetId, placement);
      if (optimistic) {
        setNotes(optimistic);
        if (placement === "into") {
          setExpandedNoteParents((ex) => {
            const n = new Set(ex);
            n.add(targetId);
            void persistExpandedNotes(projectId, n);
            return n;
          });
        }
      }
      try {
        await getNodex().wpnMoveNote({ projectId, draggedId, targetId, placement });
      } catch (e) {
        setNotes(snapshot);
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        void loadProjectTree(projectId);
      }
    },
    [loadProjectTree, persistExpandedNotes],
  );

  const refreshExplorer = useCallback(async () => {
    const pid = selectedProjectIdRef.current;
    wpnTrace("refreshExplorer.enter", { projectOpen, pid });
    setIsRefreshingExplorer(true);
    try {
      await Promise.all([
        loadWorkspaces({ manageBusy: false }),
        pid ? loadProjectTree(pid) : Promise.resolve(),
      ]);
      wpnTrace("refreshExplorer.done");
    } catch (err) {
      wpnTrace("refreshExplorer.error", { message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      setIsRefreshingExplorer(false);
    }
  }, [loadWorkspaces, loadProjectTree, projectOpen]);

  useEffect(() => {
    lastExplorerRevealForNoteIdRef.current = null;
  }, [currentNoteId]);

  // Stable signature of the current project-id set — changes only when projects are added or
  // removed, not on every polling object-reference refresh. Used to limit follow-note re-runs.
  const projectsSignature = useMemo(
    () =>
      Object.values(projectsByWs)
        .flat()
        .map((p) => p.id)
        .sort()
        .join(","),
    [projectsByWs],
  );

  // Follow the open note in the tree when the active note changes or when the set of available
  // projects changes (new project added/removed). Does NOT re-run on every polling tick that
  // produces a new `projectsByWs` object identity but the same projects — that was the source of
  // the "snap-closed" bug where browsing project B while note A was active would be interrupted
  // every ~8s by the follow effect forcing selection back to project A.
  useEffect(() => {
    if (!currentNoteId || !projectOpen) return;
    const projectsByWsSnapshot = projectsByWsRef.current;
    let cancelled = false;
    void (async () => {
      try {
        const localRow = notesRef.current.find((n) => n.id === currentNoteId);
        let pid: string | undefined;
        if (localRow) {
          pid = localRow.project_id;
        } else {
          const r = await getNodex().wpnGetNote(currentNoteId);
          if (cancelled || !r?.note) return;
          pid = r.note.project_id;
        }
        if (!pid) return;
        const visible = Object.values(projectsByWsSnapshot).some((arr) =>
          arr.some((p) => p.id === pid),
        );
        if (!visible) return;
        let wsId: string | null = null;
        for (const [w, arr] of Object.entries(projectsByWsSnapshot)) {
          if (arr.some((p) => p.id === pid)) {
            wsId = w;
            break;
          }
        }
        if (!wsId) return;
        setSearch("");
        setSelectedProjectId(pid);
        setExpandedProjects((prev) => new Set(prev).add(pid));
        setExpandedWs((prev) => new Set(prev).add(wsId));
      } catch {
        /* wpnGetNote unavailable or network error */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNoteId, projectOpen, projectsSignature]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.title.toLowerCase().includes(q) || n.type.toLowerCase().includes(q));
  }, [notes, search]);

  const noteParentsMap = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const n of notes) {
      m.set(n.id, n.parent_id ?? null);
    }
    return m;
  }, [notes]);

  useEffect(() => {
    if (!currentNoteId || !selectedProjectId) return;
    if (lastExplorerRevealForNoteIdRef.current === currentNoteId) return;
    const row = notes.find((n) => n.id === currentNoteId && n.project_id === selectedProjectId);
    if (!row) return;
    const ancestors = collectAncestorNoteIds(currentNoteId, noteParentsMap);
    const merged = new Set(expandedNoteParents);
    let changed = false;
    for (const id of ancestors) {
      if (!merged.has(id)) {
        merged.add(id);
        changed = true;
      }
    }
    lastExplorerRevealForNoteIdRef.current = currentNoteId;
    if (changed) {
      void persistExpandedNotes(selectedProjectId, merged);
    }
  }, [
    currentNoteId,
    selectedProjectId,
    notes,
    noteParentsMap,
    expandedNoteParents,
    persistExpandedNotes,
  ]);

  useLayoutEffect(() => {
    if (!currentNoteId) return;
    const root = explorerScrollRef.current;
    if (!root) return;
    const el = root.querySelector("[data-wpn-explorer-active-note]");
    if (!(el instanceof HTMLElement)) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, [currentNoteId, selectedProjectId, expandedNoteParents, filteredNotes, search]);

  const noteHasVisibleChildren = useCallback(
    (id: string) => filteredNotes.some((n) => n.parent_id === id),
    [filteredNotes],
  );

  const closeAllMenus = useCallback(() => {
    setMenu(null);
    setTypePicker(null);
  }, []);

  const onCreateWorkspace = async () => {
    await getNodex().wpnCreateWorkspace("Workspace");
    await loadWorkspaces();
    closeAllMenus();
  };

  const createWorkspaceEntry = useCallback(async () => {
    closeAllMenus();
    setBusy(true);
    try {
      const r = await getNodex().selectProjectFolder();
      if (!r.ok) {
        if ("error" in r) {
          window.alert(r.error);
        }
        return;
      }
      await getNodex().wpnCreateWorkspace("Workspace");
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [closeAllMenus]);

  const onCreateProject = async (workspaceId: string) => {
    await getNodex().wpnCreateProject(workspaceId, "Project");
    await loadWorkspaces();
    closeAllMenus();
  };

  const onDeleteWorkspace = async (id: string) => {
    if (!window.confirm("Delete this workspace and all projects and notes inside it?")) return;
    const { projects } = await getNodex().wpnListProjects(id);
    const lists = await Promise.all(projects.map((p) => getNodex().wpnListNotes(p.id)));
    const noteIds = lists.flatMap((r) => r.notes.map((n) => n.id));
    closeShellTabsForNoteIds(tabs, noteIds);
    await getNodex().wpnDeleteWorkspace(id);
    if (selectedProjectId) {
      const projs = projectsByWs[id] ?? [];
      if (projs.some((p) => p.id === selectedProjectId)) {
        setSelectedProjectId(null);
        setNotes([]);
      }
    }
    await loadWorkspaces();
    closeAllMenus();
  };

  const onDeleteProject = async (id: string) => {
    if (!window.confirm("Delete this project and all its notes?")) return;
    const { notes } = await getNodex().wpnListNotes(id);
    closeShellTabsForNoteIds(tabs, notes.map((n) => n.id));
    await getNodex().wpnDeleteProject(id);
    if (selectedProjectId === id) {
      setSelectedProjectId(null);
      setNotes([]);
    }
    await loadWorkspaces();
    closeAllMenus();
  };

  const onCreateNote = async (
    projectId: string,
    relation: CreateNoteRelation,
    type: string,
    anchorId?: string,
  ) => {
    const { id } = await getNodex().wpnCreateNoteInProject(projectId, {
      relation,
      type,
      anchorId,
    });
    const optimistic = optimisticWpnNotesAfterCreate(notesRef.current, {
      newId: id,
      projectId,
      relation,
      anchorId,
      type,
    });
    if (optimistic) {
      setNotes(optimistic);
      if (relation === "child" && anchorId) {
        setExpandedNoteParents((ex) => {
          const n = new Set(ex);
          n.add(anchorId);
          void persistExpandedNotes(projectId, n);
          return n;
        });
      }
    }
    closeAllMenus();
    const vfsPath = explorerCanonicalVfsPath(projectId, "Untitled", workspaces, projectsByWs);
    openNoteById(id, { newTab: true, ...(vfsPath ? { canonicalVfsPath: vfsPath } : {}) });
    void loadProjectTree(projectId).catch((e) => {
      console.error(e);
    });
  };

  const onDeleteNotes = async (projectId: string, ids: string[]) => {
    if (!window.confirm(`Delete ${ids.length} note(s)?`)) return;
    const snapshot = notesRef.current;
    setNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
    try {
      await getNodex().wpnDeleteNotes(ids);
    } catch (e) {
      setNotes(snapshot);
      window.alert(e instanceof Error ? e.message : String(e));
      return;
    }
    closeShellTabsForNoteIds(tabs, ids);
    closeAllMenus();
    void loadProjectTree(projectId).catch((e) => {
      console.error(e);
    });
  };

  const swapWorkspaceOrder = useCallback(
    async (wsId: string, dir: -1 | 1) => {
      const idx = workspaces.findIndex((w) => w.id === wsId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= workspaces.length) return;
      const a = workspaces[idx]!;
      const b = workspaces[j]!;
      const siA = a.sort_index;
      const siB = b.sort_index;
      await getNodex().wpnUpdateWorkspace(a.id, { sort_index: siB });
      await getNodex().wpnUpdateWorkspace(b.id, { sort_index: siA });
      await loadWorkspaces();
      closeAllMenus();
    },
    [workspaces, loadWorkspaces, closeAllMenus],
  );

  const swapProjectOrder = useCallback(
    async (workspaceId: string, projectId: string, dir: -1 | 1) => {
      const list = projectsByWs[workspaceId] ?? [];
      const idx = list.findIndex((p) => p.id === projectId);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= list.length) return;
      const a = list[idx]!;
      const b = list[j]!;
      const siA = a.sort_index;
      const siB = b.sort_index;
      await getNodex().wpnUpdateProject(a.id, { sort_index: siB });
      await getNodex().wpnUpdateProject(b.id, { sort_index: siA });
      await loadWorkspaces();
      closeAllMenus();
    },
    [projectsByWs, loadWorkspaces, closeAllMenus],
  );

  const runMoveNote = useCallback(
    async (projectId: string, draggedId: string, targetId: string, placement: NoteMovePlacement) => {
      await performWpnNoteMove(projectId, draggedId, targetId, placement);
      closeAllMenus();
    },
    [performWpnNoteMove, closeAllMenus],
  );

  const setNoteClipboard = useCallback((c: NoteClipboard | null) => {
    noteClipboardRef.current = c;
    bumpClip((x) => x + 1);
  }, []);

  const pasteNoteClipboard = useCallback(
    async (
      targetProjectId: string,
      mode: "after" | "before" | "into" | "rootEnd",
      targetNoteId?: string,
    ) => {
      const clip = noteClipboardRef.current;
      if (!clip || clip.projectId !== targetProjectId) {
        window.alert("Clipboard is empty or from another project.");
        return;
      }
      if (mode === "rootEnd") {
        if (clip.op === "cut") {
          const roots = rootIdsInPreorder(notes);
          const last = roots[roots.length - 1];
          if (last && last !== clip.noteId) {
            if (isStrictDescendantOf(notes, clip.noteId, last)) {
              window.alert("Cannot move into descendant.");
              return;
            }
            await runMoveNote(targetProjectId, clip.noteId, last, "after");
          }
          setNoteClipboard(null);
          return;
        }
        const { newRootId } = await getNodex().wpnDuplicateNoteSubtree(targetProjectId, clip.noteId);
        const fresh = (await getNodex().wpnListNotes(targetProjectId)).notes;
        const roots2 = rootIdsInPreorder(fresh);
        const last2 = roots2[roots2.length - 1];
        if (last2 && last2 !== newRootId) {
          await getNodex().wpnMoveNote({
            projectId: targetProjectId,
            draggedId: newRootId,
            targetId: last2,
            placement: "after",
          });
        }
        await loadProjectTree(targetProjectId);
        closeAllMenus();
        return;
      }
      if (!targetNoteId) return;
      if (clip.op === "cut") {
        if (clip.noteId === targetNoteId) {
          closeAllMenus();
          return;
        }
        if (mode === "into" && isStrictDescendantOf(notes, clip.noteId, targetNoteId)) {
          window.alert("Cannot move into a descendant of the selection.");
          return;
        }
        const placement: NoteMovePlacement =
          mode === "into" ? "into" : mode === "before" ? "before" : "after";
        await runMoveNote(targetProjectId, clip.noteId, targetNoteId, placement);
        setNoteClipboard(null);
        return;
      }
      const { newRootId } = await getNodex().wpnDuplicateNoteSubtree(targetProjectId, clip.noteId);
      const placement: NoteMovePlacement =
        mode === "into" ? "into" : mode === "before" ? "before" : "after";
      await getNodex().wpnMoveNote({
        projectId: targetProjectId,
        draggedId: newRootId,
        targetId: targetNoteId,
        placement,
      });
      await loadProjectTree(targetProjectId);
      closeAllMenus();
    },
    [notes, runMoveNote, loadProjectTree, closeAllMenus, setNoteClipboard],
  );

  const commitRename = useCallback(async () => {
    if (!renaming) return;
    const name = renaming.draft.trim();
    let clearRenaming = true;
    try {
      if (renaming.kind === "ws") {
        await getNodex().wpnUpdateWorkspace(renaming.id, { name: name || "Workspace" });
        await loadWorkspaces();
      } else if (renaming.kind === "project") {
        await getNodex().wpnUpdateProject(renaming.id, { name: name || "Project" });
        await loadWorkspaces();
      } else if (renaming.kind === "note" && renaming.projectId) {
        const title = name || "Untitled";
        const noteRow = notes.find((n) => n.id === renaming.id);
        const outcome = await runWpnNoteTitleRenameWithVfsDependentsFlow({
          noteId: renaming.id,
          currentTitle: noteRow?.title ?? "",
          newTitle: title,
          prompt: vfsRenameChoice.prompt,
          rename: async (updateVfsDependentLinks) => {
            await getNodex().wpnPatchNote(renaming.id, {
              title,
              updateVfsDependentLinks,
            });
          },
        });
        if (outcome === "cancelled") {
          clearRenaming = false;
          return;
        }
        if (outcome === "renamed") {
          dispatch(clearNoteTitleDraft(renaming.id));
          setNotes((prev) =>
            prev.map((x) => (x.id === renaming.id ? { ...x, title } : x)),
          );
          void loadProjectTree(renaming.projectId);
          const tabInst =
            tabs.findNoteTabByNoteId(renaming.id, SHELL_TAB_NOTE) ??
            tabs.findNoteTabByNoteId(renaming.id, SHELL_TAB_SCRATCH_MARKDOWN);
          if (tabInst) {
            tabs.updateTabPresentation(tabInst.instanceId, { title });
          }
          if (currentNoteId === renaming.id) {
            void dispatch(fetchNote(renaming.id));
          }
        }
      }
    } finally {
      if (clearRenaming) {
        setRenaming(null);
      }
    }
  }, [
    renaming,
    notes,
    vfsRenameChoice.prompt,
    loadWorkspaces,
    loadProjectTree,
    tabs,
    currentNoteId,
    dispatch,
  ]);

  const scheduleOpenNote = useCallback(
    (id: string, projectId: string, title: string) => {
      if (noteOpenTimerRef.current != null) window.clearTimeout(noteOpenTimerRef.current);
      pendingOpenNoteIdRef.current = id;
      noteOpenTimerRef.current = window.setTimeout(() => {
        noteOpenTimerRef.current = null;
        pendingOpenNoteIdRef.current = null;
        const vfsPath = explorerCanonicalVfsPath(projectId, title, workspaces, projectsByWs);
        openNoteById(id, vfsPath ? { canonicalVfsPath: vfsPath } : undefined);
      }, NOTE_OPEN_DELAY_MS);
    },
    [openNoteById, workspaces, projectsByWs],
  );

  const cancelScheduledOpen = useCallback(() => {
    if (noteOpenTimerRef.current != null) {
      window.clearTimeout(noteOpenTimerRef.current);
      noteOpenTimerRef.current = null;
    }
    pendingOpenNoteIdRef.current = null;
  }, []);

  const onDragStartNote = (e: React.DragEvent, projectId: string, noteId: string) => {
    explorerNoteDragRef.current = { projectId, noteId };
    e.dataTransfer.setData(DND_NOTE_MIME, JSON.stringify({ projectId, noteId }));
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragEndNote = () => {
    explorerNoteDragRef.current = null;
    setWpnNoteDropHint(null);
  };

  const onDropOnNote = async (
    e: React.DragEvent,
    projectId: string,
    targetId: string,
  ) => {
    e.preventDefault();
    explorerNoteDragRef.current = null;
    setWpnNoteDropHint(null);
    const raw = e.dataTransfer.getData(DND_NOTE_MIME);
    if (!raw) return;
    let parsed: { projectId: string; noteId: string };
    try {
      parsed = JSON.parse(raw) as { projectId: string; noteId: string };
    } catch {
      return;
    }
    if (parsed.projectId !== projectId || parsed.noteId === targetId) return;
    const el = e.currentTarget as HTMLElement;
    const placement = placementFromPointer(e, el);
    if (placement === "into" && isStrictDescendantOf(notes, parsed.noteId, targetId)) {
      window.alert("Cannot move into a descendant of the selection.");
      return;
    }
    if (!dropAllowedOne(parsed.noteId, targetId, placement, noteParentsMap)) {
      return;
    }
    await performWpnNoteMove(projectId, parsed.noteId, targetId, placement);
  };

  const workspaceIndex = (wsId: string) => workspaces.findIndex((w) => w.id === wsId);
  const projectIndex = (workspaceId: string, projectId: string) =>
    (projectsByWs[workspaceId] ?? []).findIndex((p) => p.id === projectId);

  const renderTypePicker = () =>
    typePicker ? (
      <div
        className="fixed z-50 max-h-64 min-w-[10rem] overflow-y-auto rounded-md border border-border bg-popover p-1 text-[11px] shadow-md"
        style={{ left: typePicker.x, top: typePicker.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="mb-1 block w-full rounded px-2 py-0.5 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
          onClick={() => setTypePicker(null)}
        >
          Back
        </button>
        {selectableTypes.length === 0 ? (
          <div className="px-2 py-1 text-[10px] text-muted-foreground">
            Install note plugins (Plugin Manager) for types.
          </div>
        ) : (
          selectableTypes.map((t) => (
            <button
              key={t}
              type="button"
              className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
              onClick={() => void onCreateNote(typePicker.projectId, typePicker.relation, t, typePicker.anchorId)}
            >
              {t}
            </button>
          ))
        )}
      </div>
    ) : null;

  const renderNoteRows = (projectId: string) => {
    const rows: React.ReactNode[] = [];
    for (const n of filteredNotes) {
      if (n.depth > 0 && n.parent_id && !expandedNoteParents.has(n.parent_id)) {
        continue;
      }
      const hasKids = noteHasVisibleChildren(n.id);
      const pad = 10 + n.depth * 12;
      const isRenamingNote = renaming?.kind === "note" && renaming.id === n.id;
      const rowDropHint =
        wpnNoteDropHint?.targetId === n.id ? wpnNoteDropHint.placement : null;
      rows.push(
        <div
          key={n.id}
          data-wpn-explorer-active-note={currentNoteId === n.id ? "" : undefined}
          className={`group relative flex min-h-7 w-full items-center gap-0.5 border-b border-border/30 text-[11px] ${
            currentNoteId === n.id ? "bg-muted/50" : "hover:bg-muted/25"
          }`}
          style={{ paddingLeft: pad }}
          onClick={(e) => {
            if (isRenamingNote) return;
            const el = e.target as HTMLElement;
            if (el.closest("[data-wpn-note-drag-handle]") || el.closest("[data-wpn-tree-chevron]")) return;
            scheduleOpenNote(n.id, projectId, noteTitleDraftById[n.id] ?? n.title);
          }}
          onDoubleClick={(e) => {
            if (isRenamingNote) return;
            const el = e.target as HTMLElement;
            if (el.closest("[data-wpn-note-drag-handle]") || el.closest("[data-wpn-tree-chevron]")) return;
            e.preventDefault();
            cancelScheduledOpen();
            setRenaming({
              kind: "note",
              id: n.id,
              projectId,
              draft: noteTitleDraftById[n.id] ?? n.title,
            });
          }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(DND_NOTE_MIME)) {
              return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const drag = explorerNoteDragRef.current;
            if (!drag || drag.projectId !== projectId) {
              e.dataTransfer.dropEffect = "none";
              setWpnNoteDropHint((h) => (h?.targetId === n.id ? null : h));
              return;
            }
            const placement = placementFromPointer(e, e.currentTarget as HTMLElement);
            if (!dropAllowedOne(drag.noteId, n.id, placement, noteParentsMap)) {
              e.dataTransfer.dropEffect = "none";
              setWpnNoteDropHint((h) => (h?.targetId === n.id ? null : h));
              return;
            }
            setWpnNoteDropHint((h) =>
              h?.targetId === n.id && h.placement === placement ? h : { targetId: n.id, placement },
            );
          }}
          onDragLeave={(e) => {
            const rel = e.relatedTarget as Node | null;
            const cur = e.currentTarget as HTMLElement;
            if (rel && cur.contains(rel)) return;
            setWpnNoteDropHint((h) => (h?.targetId === n.id ? null : h));
          }}
          onDrop={(e) => void onDropOnNote(e, projectId, n.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTypePicker(null);
            setMenu({
              x: e.clientX,
              y: e.clientY,
              kind: "note",
              id: n.id,
              projectId,
            });
          }}
        >
          <span
            data-wpn-note-drag-handle
            className="w-4 shrink-0 cursor-grab text-muted-foreground opacity-60"
            draggable
            onDragStart={(e) => onDragStartNote(e, projectId, n.id)}
            onDragEnd={onDragEndNote}
            onContextMenu={(e) => e.stopPropagation()}
            title="Drag to reorder (top/bottom of row) or nest (drop on middle of row)"
          >
            ⣿
          </span>
          {rowDropHint ? (
            <span
              className="pointer-events-none absolute right-1 top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded border border-border bg-popover px-1 py-px text-[8px] font-medium leading-tight text-foreground shadow-sm"
              aria-live="polite"
            >
              {rowDropHint === "before"
                ? "above"
                : rowDropHint === "after"
                  ? "below"
                  : "into"}
            </span>
          ) : null}
          {rowDropHint === "before" ? (
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex items-center justify-center"
              aria-hidden
            >
              <div className="h-[2px] w-full rounded-full bg-foreground shadow-[0_0_0_1px_hsl(var(--background))]" />
            </div>
          ) : null}
          {rowDropHint === "after" ? (
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center"
              aria-hidden
            >
              <div className="h-[2px] w-full rounded-full bg-foreground shadow-[0_0_0_1px_hsl(var(--background))]" />
            </div>
          ) : null}
          {rowDropHint === "into" ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 rounded-sm border-2 border-dotted border-foreground/60 bg-foreground/5 dark:bg-foreground/12"
              aria-hidden
            />
          ) : null}
          {hasKids ? (
            <button
              type="button"
              data-wpn-tree-chevron
              className="w-4 shrink-0 text-[10px] text-muted-foreground"
              onContextMenu={(e) => e.stopPropagation()}
              onClick={() => {
                const next = new Set(expandedNoteParents);
                if (next.has(n.id)) next.delete(n.id);
                else next.add(n.id);
                void persistExpandedNotes(projectId, next);
              }}
            >
              {expandedNoteParents.has(n.id) ? "▼" : "▶"}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {isRenamingNote ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <span className="shrink-0 text-muted-foreground" title={n.type}>
                [{noteTypeExplorerAbbrev(n.type)}]
              </span>
              <InlineSingleLineEditable
                key={`note-${n.id}`}
                className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Note title"
                value={renaming.draft}
                onChange={(draft) => {
                  setRenaming({ ...renaming, draft });
                  dispatch(setNoteTitleDraft({ id: n.id, text: draft }));
                }}
                onCommit={() => void commitRename()}
                onCancel={() => {
                  dispatch(clearNoteTitleDraft(n.id));
                  setRenaming(null);
                }}
              />
            </div>
          ) : (
            <span className="min-w-0 flex-1 truncate text-left">
              <span className="text-muted-foreground" title={n.type}>
                [{noteTypeExplorerAbbrev(n.type)}]
              </span>{" "}
              {noteTitleDraftById[n.id] !== undefined ? noteTitleDraftById[n.id]! : n.title}
            </span>
          )}
        </div>,
      );
    }
    return rows;
  };

  if (!projectOpen) {
    return (
      <div
        className="relative flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
        data-nodex-own-contextmenu
        onClick={() => closeAllMenus()}
        onContextMenu={(e) => {
          e.preventDefault();
          if (showFolderBasedWorkspaceCreate) {
            setMenu({ x: e.clientX, y: e.clientY, kind: "no_project", id: "" });
          }
        }}
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center text-[12px] text-muted-foreground">
          <p className="font-medium text-foreground">No workspace yet.</p>
          {showFolderBasedWorkspaceCreate ? (
            <>
              <p className="max-w-[14rem] text-[11px] leading-relaxed">
                Create a workspace: choose or create a folder on disk for your notes database, then add projects and
                notes here.
              </p>
              <button
                type="button"
                disabled={busy}
                className="rounded border border-border bg-muted/20 px-3 py-1.5 text-[11px] text-foreground hover:bg-muted/40 disabled:opacity-50"
                onClick={(e) => {
                  e.stopPropagation();
                  void createWorkspaceEntry();
                }}
              >
                Create workspace…
              </button>
              <p className="text-[10px] opacity-70">Or right-click in this panel for the same action.</p>
            </>
          ) : (
            <>
              <p className="max-w-[18rem] text-[11px] leading-relaxed">
                Sign in with{" "}
                <button
                  type="button"
                  className="font-medium text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-500 dark:text-sky-400"
                  onClick={() => openWebAuth("login")}
                >
                  Login
                </button>{" "}
                or{" "}
                <button
                  type="button"
                  className="font-medium text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-500 dark:text-sky-400"
                  onClick={() => openWebAuth("signup")}
                >
                  Signup
                </button>{" "}
                to load your workspaces and notes here.
              </p>
              <p className="max-w-[18rem] text-[11px] leading-relaxed text-muted-foreground">
                Prefer files on your computer? Use the Nodex desktop app when it’s available.
              </p>
              {process.env.NODE_ENV === "development" && !syncWpnNotesBackend() ? (
                <p className="max-w-[20rem] text-[10px] leading-relaxed text-muted-foreground/70">
                  Dev: local browser setup needs the headless API with{" "}
                  <code className="rounded bg-muted/50 px-0.5 font-mono text-[9px]">NODEX_PROJECT_ROOT</code> or{" "}
                  <code className="rounded bg-muted/50 px-0.5 font-mono text-[9px]">?web=1&amp;api=…</code>.
                </p>
              ) : null}
            </>
          )}
        </div>
        {menu?.kind === "no_project" && showFolderBasedWorkspaceCreate ? (
          <div
            className="fixed z-50 min-w-[10rem] rounded-md border border-border bg-popover p-1 text-[11px] shadow-md"
            style={{ left: menu.x, top: menu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-50"
              disabled={busy}
              onClick={() => void createWorkspaceEntry()}
            >
              Create workspace…
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const clip = noteClipboardRef.current;

  return (
    <>
      {vfsRenameChoice.portal}
      <div
        className="flex h-full min-h-0 min-w-0 w-full flex-col bg-sidebar text-sidebar-foreground"
        data-nodex-own-contextmenu
        onClick={() => closeAllMenus()}
      >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border bg-muted/10 px-2 py-1">
        {wpnOwnerLabel ? (
          <span
            className="mr-1 max-w-[8rem] truncate text-[10px] text-muted-foreground"
            title={`WPN owner: ${wpnOwnerLabel}`}
          >
            {wpnOwnerLabel}
          </span>
        ) : null}
        <button
          type="button"
          className="rounded border border-border/60 px-2 py-0.5 text-[10px] hover:bg-muted/40 disabled:opacity-50"
          onClick={() => void refreshExplorer()}
          disabled={isRefreshingExplorer}
          title="Reload workspaces, projects, and the open project’s note list"
        >
          {isRefreshingExplorer ? "…" : "Refresh"}
        </button>
        <button
          type="button"
          className="rounded border border-border/60 px-2 py-0.5 text-[10px] hover:bg-muted/40"
          onClick={() => void onCreateWorkspace()}
        >
          + Workspace
        </button>
        <input
          className="min-w-[6rem] flex-1 rounded border border-border/60 bg-background px-2 py-0.5 text-[10px]"
          placeholder="Search notes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div
        ref={explorerScrollRef}
        className="min-h-0 flex-1 overflow-y-auto text-[11px]"
        onContextMenu={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('button,input,textarea,a,[draggable="true"],[contenteditable="true"]')) return;
          e.preventDefault();
          setTypePicker(null);
          setMenu({ x: e.clientX, y: e.clientY, kind: "panel_empty", id: "" });
        }}
      >
        {workspaces.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No workspaces yet. Use <strong>+ Workspace</strong> or right-click in this panel.
          </div>
        ) : (
          workspaces.map((w) => {
            const isRenamingWs = renaming?.kind === "ws" && renaming.id === w.id;
            return (
              <div key={w.id} className="border-b border-border/40">
                <div
                  className="flex w-full min-w-0 items-center gap-1 bg-muted/15 px-1 py-0.5"
                  onContextMenu={(e) => {
                    if ((e.target as HTMLElement).closest("[data-wpn-tree-chevron]")) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setTypePicker(null);
                    setMenu({ x: e.clientX, y: e.clientY, kind: "ws", id: w.id });
                  }}
                >
                  <button
                    type="button"
                    data-wpn-tree-chevron
                    className="w-5 text-[10px] text-muted-foreground"
                    onContextMenu={(e) => e.stopPropagation()}
                    onClick={() => {
                      const n = new Set(expandedWs);
                      if (n.has(w.id)) n.delete(w.id);
                      else n.add(w.id);
                      setExpandedWs(n);
                    }}
                  >
                    {expandedWs.has(w.id) ? "▼" : "▶"}
                  </button>
                  {isRenamingWs ? (
                    <InlineSingleLineEditable
                      key={`ws-${w.id}`}
                      className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      aria-label="Workspace name"
                      value={renaming.draft}
                      onChange={(draft) => setRenaming({ ...renaming, draft })}
                      onCommit={() => void commitRename()}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[11px] font-medium shadow-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setRenaming({ kind: "ws", id: w.id, draft: w.name });
                      }}
                    >
                      {w.name}
                    </button>
                  )}
                  <button
                    type="button"
                    data-wpn-workspace-add-project
                    className="shrink-0 text-[10px] text-muted-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onCreateProject(w.id);
                    }}
                  >
                    + Project
                  </button>
                </div>
                {expandedWs.has(w.id) ? (
                  <div className="pl-2">
                    {(projectsByWs[w.id] ?? []).map((p) => {
                      const isRenamingProj = renaming?.kind === "project" && renaming.id === p.id;
                      return (
                        <div key={p.id}>
                          <div
                            className="flex w-full items-center gap-1 py-0.5"
                            onClick={(e) => {
                              if (isRenamingProj) return;
                              if ((e.target as HTMLElement).closest("[data-wpn-tree-chevron]")) return;
                              setSelectedProjectId(p.id);
                            }}
                            onDoubleClick={(e) => {
                              if (isRenamingProj) return;
                              if ((e.target as HTMLElement).closest("[data-wpn-tree-chevron]")) return;
                              e.preventDefault();
                              setRenaming({ kind: "project", id: p.id, workspaceId: w.id, draft: p.name });
                            }}
                            onContextMenu={(e) => {
                              if ((e.target as HTMLElement).closest("[data-wpn-tree-chevron]")) return;
                              e.preventDefault();
                              e.stopPropagation();
                              setTypePicker(null);
                              setMenu({
                                x: e.clientX,
                                y: e.clientY,
                                kind: "project",
                                id: p.id,
                                workspaceId: w.id,
                              });
                            }}
                          >
                            <button
                              type="button"
                              data-wpn-tree-chevron
                              className="w-5 text-[10px] text-muted-foreground"
                              onContextMenu={(e) => e.stopPropagation()}
                              onClick={() => {
                                const n = new Set(expandedProjects);
                                if (n.has(p.id)) n.delete(p.id);
                                else {
                                  n.add(p.id);
                                  setSelectedProjectId(p.id);
                                }
                                setExpandedProjects(n);
                              }}
                            >
                              {expandedProjects.has(p.id) ? "▼" : "▶"}
                            </button>
                            {isRenamingProj ? (
                              <InlineSingleLineEditable
                                key={`project-${p.id}`}
                                className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0 text-[11px] outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                aria-label="Project name"
                                value={renaming.draft}
                                onChange={(draft) => setRenaming({ ...renaming, draft })}
                                onCommit={() => void commitRename()}
                                onCancel={() => setRenaming(null)}
                              />
                            ) : (
                              <span
                                className={`min-w-0 flex-1 truncate text-left ${
                                  selectedProjectId === p.id ? "font-semibold text-foreground" : ""
                                }`}
                              >
                                {p.name}
                              </span>
                            )}
                          </div>
                          {expandedProjects.has(p.id) && selectedProjectId === p.id ? (
                            <div className="border-l border-border/40 pl-1">
                              <div
                                className="min-h-6 py-1 pl-6 text-[10px] text-muted-foreground"
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setTypePicker(null);
                                  setMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    kind: "projectBody",
                                    id: p.id,
                                    workspaceId: w.id,
                                    projectId: p.id,
                                  });
                                }}
                              >
                                Right-click for new root note or paste.
                              </div>
                              {renderNoteRows(p.id)}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {menu ? (
        <div
          className="fixed z-50 min-w-[11rem] rounded-md border border-border bg-popover p-1 text-[11px] shadow-md"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.kind === "ws" ? (
            <>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => void onCreateProject(menu.id)}
              >
                Create project
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const w = workspaces.find((x) => x.id === menu.id);
                  if (w) setRenaming({ kind: "ws", id: w.id, draft: w.name });
                  closeAllMenus();
                }}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={workspaceIndex(menu.id) <= 0}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void swapWorkspaceOrder(menu.id, -1)}
              >
                Move workspace up
              </button>
              <button
                type="button"
                disabled={workspaceIndex(menu.id) < 0 || workspaceIndex(menu.id) >= workspaces.length - 1}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void swapWorkspaceOrder(menu.id, 1)}
              >
                Move workspace down
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const w = workspaces.find((x) => x.id === menu.id);
                  if (w) void navigator.clipboard.writeText(w.name);
                  closeAllMenus();
                }}
              >
                Copy name
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-destructive/15"
                onClick={() => void onDeleteWorkspace(menu.id)}
              >
                Delete workspace
              </button>
            </>
          ) : null}
          {menu.kind === "project" && menu.workspaceId ? (
            <>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  setTypePicker({
                    x: menu.x,
                    y: menu.y,
                    projectId: menu.id,
                    relation: "root",
                  });
                  setMenu(null);
                }}
              >
                New root note…
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const wsId = menu.workspaceId!;
                  const list = projectsByWs[wsId] ?? [];
                  const pr = list.find((x) => x.id === menu.id);
                  if (pr) setRenaming({ kind: "project", id: pr.id, workspaceId: wsId, draft: pr.name });
                  closeAllMenus();
                }}
              >
                Rename
              </button>
              <button
                type="button"
                disabled={projectIndex(menu.workspaceId!, menu.id) <= 0}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void swapProjectOrder(menu.workspaceId!, menu.id, -1)}
              >
                Move project up
              </button>
              <button
                type="button"
                disabled={
                  projectIndex(menu.workspaceId!, menu.id) < 0 ||
                  projectIndex(menu.workspaceId!, menu.id) >= (projectsByWs[menu.workspaceId!] ?? []).length - 1
                }
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void swapProjectOrder(menu.workspaceId!, menu.id, 1)}
              >
                Move project down
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const list = projectsByWs[menu.workspaceId!] ?? [];
                  const pr = list.find((x) => x.id === menu.id);
                  if (pr) void navigator.clipboard.writeText(pr.name);
                  closeAllMenus();
                }}
              >
                Copy name
              </button>
              <div className="px-2 py-1 text-[10px] text-muted-foreground">Move to workspace</div>
              <select
                className="mb-1 w-full rounded border border-border/60 bg-background text-[10px]"
                defaultValue=""
                onChange={async (e) => {
                  const wid = e.target.value;
                  e.target.value = "";
                  if (!wid || wid === menu.workspaceId) return;
                  await getNodex().wpnUpdateProject(menu.id, { workspace_id: wid });
                  await loadWorkspaces();
                  closeAllMenus();
                }}
              >
                <option value="">Choose…</option>
                {workspaces
                  .filter((x) => x.id !== menu.workspaceId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-destructive/15"
                onClick={() => void onDeleteProject(menu.id)}
              >
                Delete project
              </button>
            </>
          ) : null}
          {menu.kind === "projectBody" && menu.projectId ? (
            <>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  setTypePicker({
                    x: menu.x,
                    y: menu.y,
                    projectId: menu.projectId!,
                    relation: "root",
                  });
                  setMenu(null);
                }}
              >
                New root note…
              </button>
              <button
                type="button"
                disabled={!clip || clip.projectId !== menu.projectId}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void pasteNoteClipboard(menu.projectId!, "rootEnd")}
              >
                Paste
              </button>
            </>
          ) : null}
          {menu.kind === "panel_empty" ? (
            <>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => void onCreateWorkspace()}
              >
                New workspace
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-50"
                onClick={() => void refreshExplorer()}
                disabled={isRefreshingExplorer}
              >
                Refresh
              </button>
            </>
          ) : null}
          {menu.kind === "note" && menu.projectId ? (
            <>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  setTypePicker({
                    x: menu.x,
                    y: menu.y,
                    projectId: menu.projectId!,
                    relation: "child",
                    anchorId: menu.id,
                  });
                  setMenu(null);
                }}
              >
                New child…
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  setTypePicker({
                    x: menu.x,
                    y: menu.y,
                    projectId: menu.projectId!,
                    relation: "sibling",
                    anchorId: menu.id,
                  });
                  setMenu(null);
                }}
              >
                New sibling…
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                type="button"
                className="mt-1 block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const row = notes.find((x) => x.id === menu.id);
                  if (row)
                    setRenaming({
                      kind: "note",
                      id: row.id,
                      projectId: menu.projectId!,
                      draft: noteTitleDraftById[row.id] ?? row.title,
                    });
                  closeAllMenus();
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const row = notes.find((x) => x.id === menu.id);
                  const path =
                    row && menu.projectId
                      ? explorerDisplayWpnNotePath(
                          menu.projectId,
                          row.title,
                          workspaces,
                          projectsByWs,
                        )
                      : undefined;
                  closeAllMenus();
                  if (!path) {
                    return;
                  }
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(path);
                    } catch {
                      showToast({ severity: "error", message: "Could not copy" });
                    }
                  })();
                }}
              >
                Copy note path
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  closeAllMenus();
                  void (async () => {
                    try {
                      await navigator.clipboard.writeText(menu.id);
                    } catch {
                      showToast({ severity: "error", message: "Could not copy" });
                    }
                  })();
                }}
              >
                Copy note ID
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  setNoteClipboard({ op: "copy", projectId: menu.projectId!, noteId: menu.id });
                  closeAllMenus();
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  setNoteClipboard({ op: "cut", projectId: menu.projectId!, noteId: menu.id });
                  closeAllMenus();
                }}
              >
                Cut
              </button>
              <div className="px-2 py-0.5 text-[10px] text-muted-foreground">Paste</div>
              <button
                type="button"
                disabled={!clip || clip.projectId !== menu.projectId}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void pasteNoteClipboard(menu.projectId!, "before", menu.id)}
              >
                Paste before
              </button>
              <button
                type="button"
                disabled={!clip || clip.projectId !== menu.projectId}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void pasteNoteClipboard(menu.projectId!, "after", menu.id)}
              >
                Paste after
              </button>
              <button
                type="button"
                disabled={!clip || clip.projectId !== menu.projectId}
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40 disabled:opacity-40"
                onClick={() => void pasteNoteClipboard(menu.projectId!, "into", menu.id)}
              >
                Paste into
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                onClick={() => {
                  const row = notes.find((x) => x.id === menu.id);
                  const vfsPath =
                    menu.projectId && row
                      ? explorerCanonicalVfsPath(menu.projectId, row.title, workspaces, projectsByWs)
                      : undefined;
                  openNoteById(menu.id, vfsPath ? { canonicalVfsPath: vfsPath } : undefined);
                }}
              >
                Open note
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-destructive/15"
                onClick={() => void onDeleteNotes(menu.projectId!, [menu.id])}
              >
                Delete note
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                disabled={!prevSiblingSameDepth(notes, menu.id)}
                onClick={() => {
                  const prev = prevSiblingSameDepth(notes, menu.id);
                  if (prev)
                    void runMoveNote(menu.projectId!, menu.id, prev.id, "before");
                }}
              >
                Move up
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                disabled={!nextSiblingSameDepth(notes, menu.id)}
                onClick={() => {
                  const next = nextSiblingSameDepth(notes, menu.id);
                  if (next) void runMoveNote(menu.projectId!, menu.id, next.id, "after");
                }}
              >
                Move down
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                disabled={!prevSiblingSameDepth(notes, menu.id)}
                onClick={() => {
                  const prev = prevSiblingSameDepth(notes, menu.id);
                  if (prev) void runMoveNote(menu.projectId!, menu.id, prev.id, "into");
                }}
              >
                Indent
              </button>
              <button
                type="button"
                className="block w-full rounded px-2 py-1 text-left hover:bg-muted/40"
                disabled={!notes.find((x) => x.id === menu.id)?.parent_id}
                onClick={() => {
                  const n = notes.find((x) => x.id === menu.id);
                  const pid = n?.parent_id;
                  if (pid) void runMoveNote(menu.projectId!, menu.id, pid, "after");
                }}
              >
                Outdent
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {renderTypePicker()}
      </div>
    </>
  );
}
