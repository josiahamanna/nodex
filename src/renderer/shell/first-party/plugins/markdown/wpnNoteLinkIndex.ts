import type { WpnNoteWithContextListItem } from "../../../../../shared/wpn-v2-types";

export type WpnNoteLinkRow = {
  noteId: string;
  title: string;
  workspaceName: string;
  projectName: string;
  /** `Workspace / Project / Note title` for list display and search */
  pathLabel: string;
};

function trimLabel(s: string, fallback: string): string {
  const t = s.trim();
  return t.length > 0 ? t : fallback;
}

function rowsFromBulk(notes: readonly WpnNoteWithContextListItem[]): WpnNoteLinkRow[] {
  return notes.map((n) => {
    const wsName = trimLabel(n.workspace_name, "Workspace");
    const projName = trimLabel(n.project_name, "Project");
    const title = trimLabel(n.title, "Untitled");
    const pathLabel = `${wsName} / ${projName} / ${title}`;
    return {
      noteId: n.id,
      title,
      workspaceName: wsName,
      projectName: projName,
      pathLabel,
    };
  });
}

/**
 * Loads every WPN note (all workspaces and projects, including Documentation) for link insertion.
 * Uses `wpnListAllNotesWithContext` when available; falls back to nested list calls.
 */
export async function fetchWpnNoteLinkIndex(): Promise<WpnNoteLinkRow[]> {
  const nodex = typeof window !== "undefined" ? window.Nodex : undefined;
  if (!nodex?.wpnListWorkspaces) {
    return [];
  }

  if (nodex.wpnListAllNotesWithContext) {
    try {
      const res = await nodex.wpnListAllNotesWithContext();
      const notes = Array.isArray(res?.notes) ? res.notes : [];
      return rowsFromBulk(notes);
    } catch {
      /* fall through */
    }
  }

  let workspaces: { id: string; name: string }[] = [];
  try {
    const res = await nodex.wpnListWorkspaces();
    workspaces = Array.isArray(res?.workspaces) ? res.workspaces : [];
  } catch {
    return [];
  }

  const projectTasks: Promise<{
    workspace: { id: string; name: string };
    projects: { id: string; name: string }[];
  }>[] = workspaces.map(async (w) => {
    try {
      const { projects } = await nodex.wpnListProjects(w.id);
      return { workspace: w, projects: Array.isArray(projects) ? projects : [] };
    } catch {
      return { workspace: w, projects: [] };
    }
  });

  const workspaceProjects = await Promise.all(projectTasks);

  const noteTasks: Promise<WpnNoteLinkRow[]>[] = [];
  for (const { workspace, projects } of workspaceProjects) {
    const wsName = trimLabel(workspace.name, "Workspace");
    for (const project of projects) {
      const projName = trimLabel(project.name, "Project");
      noteTasks.push(
        (async () => {
          try {
            const { notes } = await nodex.wpnListNotes(project.id);
            const list = Array.isArray(notes) ? notes : [];
            return list.map((n) => {
              const title = trimLabel(n.title, "Untitled");
              const pathLabel = `${wsName} / ${projName} / ${title}`;
              return {
                noteId: n.id,
                title,
                workspaceName: wsName,
                projectName: projName,
                pathLabel,
              };
            });
          } catch {
            return [];
          }
        })(),
      );
    }
  }

  const chunks = await Promise.all(noteTasks);
  return chunks.flat();
}

export function filterWpnNoteLinkRows(rows: readonly WpnNoteLinkRow[], query: string): WpnNoteLinkRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(
    (r) =>
      r.title.toLowerCase().includes(q) ||
      r.pathLabel.toLowerCase().includes(q) ||
      r.noteId.toLowerCase().includes(q),
  );
}
