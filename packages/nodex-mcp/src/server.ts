import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadWpnHttpConfig } from "./config.js";
import { findNotesByQuery, findProjectsByQuery } from "./find-wpn.js";
import { resolveNoteFromCatalog } from "./resolve-note.js";
import { errorResult, jsonResult } from "./text-result.js";
import { WpnHttpClient } from "./wpn-client.js";

const resolveInput = z.object({
  workspaceName: z.string().describe("Workspace name (trimmed, case-insensitive match)"),
  projectName: z.string().describe("Project name (trimmed, case-insensitive match)"),
  noteTitle: z.string().describe("Note title (trimmed, case-insensitive match)"),
});

const getNoteInput = z.object({
  noteId: z.string().describe("Canonical note UUID"),
});

const findProjectsInput = z.object({
  query: z.string().describe("Project name or project UUID"),
  workspaceQuery: z
    .string()
    .optional()
    .describe("Optional workspace name or UUID to limit search (required if project name clashes across workspaces)."),
});

const findNotesInput = z.object({
  query: z.string().describe("Note title or note UUID"),
  workspaceQuery: z
    .string()
    .optional()
    .describe("Optional workspace name or UUID to narrow results"),
  projectQuery: z
    .string()
    .optional()
    .describe("Optional project name or UUID to narrow results"),
});

const executeNoteInput = z.object({
  noteQuery: z
    .string()
    .describe("Note title or canonical note UUID (same matching rules as nodex_find_notes)."),
  workspaceQuery: z
    .string()
    .optional()
    .describe("Optional workspace name or UUID to narrow results before fetch."),
  projectQuery: z
    .string()
    .optional()
    .describe("Optional project name or UUID to narrow results before fetch."),
});

const listWpnInput = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("workspaces") }),
  z.object({
    scope: z.literal("projects"),
    workspaceId: z.string().describe("Workspace id from scope=workspaces"),
  }),
  z.object({
    scope: z.literal("notes"),
    projectId: z.string().describe("Project id from scope=projects"),
  }),
  z.object({ scope: z.literal("full_tree") }),
]);

const writeBackChildInput = z.object({
  taskNoteId: z
    .string()
    .describe(
      "The Nodex note id the agent worked from; the write-back is created as a new direct child of this note.",
    ),
  title: z.string().describe("Title for the new child note (e.g. session summary or task outcome)."),
  content: z.string().describe("Body for the new child note (markdown or plain text)."),
  type: z
    .string()
    .optional()
    .describe("Note type; defaults to markdown when omitted."),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const writeNoteInput = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("patch_existing"),
    noteId: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    type: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  }),
  z.object({
    mode: z.literal("create_root"),
    projectId: z.string(),
    type: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    mode: z.literal("create_child"),
    projectId: z.string(),
    anchorId: z.string(),
    type: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    mode: z.literal("create_sibling"),
    projectId: z.string(),
    anchorId: z.string(),
    type: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
]);

export async function runMcpStdioServer(): Promise<void> {
  const cfg = loadWpnHttpConfig();
  const client = new WpnHttpClient(cfg);

  const mcp = new McpServer(
    { name: "nodex-mcp", version: "0.0.0" },
    {
      capabilities: {
        tools: {},
      },
      instructions:
        "Nodex WPN tools: nodex_list_wpn lists workspaces / projects / notes or a full_tree; " +
        "nodex_find_projects / nodex_find_notes resolve by name or UUID with path (Workspace / Project / Title) and ambiguity hints; " +
        "nodex_resolve_note finds a noteId from workspace+project+title; nodex_get_note reads a note; " +
        "nodex_execute_note resolves by title or id, returns ambiguity (path + noteId per candidate) for the user to pick, or returns the full note when unique — then the agent follows note.content; " +
        "nodex_write_note patches or creates notes; nodex_write_back_child creates a child under a task note after completing work scoped to that note. " +
        "Write-back policy: when you finish work that was driven by a specific Nodex note, call nodex_write_back_child with taskNoteId equal to that note so the outcome is attached as a new direct child (audit trail). " +
        "If that note already has other children, still attach the write-back as a new direct child of the same task note unless the user asked for a different placement. " +
        "Tool overlap is intentional: nodex_execute_note equals find_notes then get_note when unique; nodex_write_back_child equals get_note then write_note create_child when you only have taskNoteId. " +
        "Configure NODEX_SYNC_API_BASE + NODEX_ACCESS_TOKEN (cloud) or NODEX_LOCAL_WPN_URL + NODEX_LOCAL_WPN_TOKEN (Electron loopback).",
    },
  );

  mcp.registerTool(
    "nodex_find_projects",
    {
      description:
        "Find project(s) by name or id. Returns status unique | ambiguous | none | workspace_ambiguous; " +
        "each match includes projectId, names, and path \"Workspace / Project\". On clash, all candidates are listed.",
      inputSchema: findProjectsInput,
    },
    async (args) => {
      try {
        const result = await findProjectsByQuery(client, args.query, args.workspaceQuery);
        return jsonResult(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.registerTool(
    "nodex_find_notes",
    {
      description:
        "Find note(s) by title or id using GET /wpn/notes-with-context. Optional workspaceQuery / projectQuery narrow scope. " +
        "Returns status unique | ambiguous | none | workspace_ambiguous | project_ambiguous; " +
        "each match includes noteId, title, and path \"Workspace / Project / Title\".",
      inputSchema: findNotesInput,
    },
    async (args) => {
      try {
        const rows = await client.getNotesWithContext();
        const result = findNotesByQuery(
          rows,
          args.query,
          args.workspaceQuery,
          args.projectQuery,
        );
        return jsonResult(result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.registerTool(
    "nodex_list_wpn",
    {
      description:
        "List WPN data: workspaces (GET /wpn/workspaces), projects in a workspace, flat note tree for a project, or full_tree (all nested).",
      inputSchema: listWpnInput,
    },
    async (args) => {
      try {
        if (args.scope === "workspaces") {
          const workspaces = await client.getWorkspaces();
          return jsonResult({ scope: "workspaces", workspaces });
        }
        if (args.scope === "projects") {
          const projects = await client.getProjects(args.workspaceId);
          return jsonResult({
            scope: "projects",
            workspaceId: args.workspaceId,
            projects,
          });
        }
        if (args.scope === "notes") {
          const notes = await client.getNotesFlat(args.projectId);
          return jsonResult({ scope: "notes", projectId: args.projectId, notes });
        }
        const workspaces = await client.getWorkspaces();
        type Row = { id: string; name?: string };
        const wsRows = workspaces as Row[];
        const tree: {
          workspace: Row;
          projects: { project: Row; notes: unknown[] }[];
        }[] = [];
        for (const w of wsRows) {
          const projectsRaw = await client.getProjects(w.id);
          const projects = projectsRaw as Row[];
          const projectBlocks: { project: Row; notes: unknown[] }[] = [];
          for (const p of projects) {
            const notes = await client.getNotesFlat(p.id);
            projectBlocks.push({ project: p, notes });
          }
          tree.push({ workspace: w, projects: projectBlocks });
        }
        return jsonResult({ scope: "full_tree", tree });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.tool(
    "nodex_resolve_note",
    "Resolve a note to its canonical UUID using workspace name, project name, and note title. " +
      "Matching is trim + case-insensitive. Returns an error if zero or multiple notes match.",
    resolveInput.shape,
    async (args) => {
      try {
        const rows = await client.getNotesWithContext();
        const r = resolveNoteFromCatalog(rows, {
          workspaceName: args.workspaceName,
          projectName: args.projectName,
          noteTitle: args.noteTitle,
        });
        if (!r.ok) {
          return errorResult(
            JSON.stringify(
              {
                error:
                  r.reason === "none"
                    ? "No note matched workspace/project/title."
                    : "Multiple notes matched; disambiguate titles or use noteId from candidates.",
                reason: r.reason,
                candidates: r.candidates,
              },
              null,
              2,
            ),
          );
        }
        return jsonResult({
          noteId: r.noteId,
          workspaceId: r.workspaceId,
          workspaceName: r.workspaceName,
          projectId: r.projectId,
          projectName: r.projectName,
          title: r.title,
          type: r.type,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.tool(
    "nodex_get_note",
    "Fetch a single note by id (includes content and metadata).",
    getNoteInput.shape,
    async (args) => {
      try {
        const note = await client.getNote(args.noteId);
        return jsonResult({ note });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.registerTool(
    "nodex_execute_note",
    {
      description:
        "Resolve a task note by title or UUID (optional workspaceQuery / projectQuery), then fetch it when the match is unique. " +
        "If multiple notes share the title, returns status ambiguous with each candidate's full path and noteId — have the user pick one, then call again with noteQuery set to that UUID (or narrow filters). " +
        "On success, the agent should read note.content and follow those instructions in the session.",
      inputSchema: executeNoteInput,
    },
    async (args) => {
      try {
        const rows = await client.getNotesWithContext();
        const resolved = findNotesByQuery(
          rows,
          args.noteQuery,
          args.workspaceQuery,
          args.projectQuery,
        );
        if (resolved.status !== "unique") {
          return jsonResult({
            stage: "needs_resolution" as const,
            ...resolved,
            nextStep:
              "If ambiguous, show the user each path and noteId from matches; after they choose, call nodex_execute_note again with noteQuery equal to the chosen noteId (or narrow workspaceQuery/projectQuery).",
          });
        }
        const note = await client.getNote(resolved.matches[0]!.noteId);
        return jsonResult({
          stage: "fetched" as const,
          match: resolved.matches[0],
          note,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.registerTool(
    "nodex_write_back_child",
    {
      description:
        "After completing work scoped to a Nodex task note, persist results as a new direct child of that note (GET task note for project, then POST create child). " +
        "Prefer this over nodex_write_note create_child when you only know taskNoteId.",
      inputSchema: writeBackChildInput,
    },
    async (args) => {
      try {
        const task = await client.getNote(args.taskNoteId);
        const noteType = (args.type ?? "markdown").trim() || "markdown";
        const created = await client.createNote(task.project_id, {
          type: noteType,
          relation: "child",
          anchorId: args.taskNoteId,
          title: args.title,
          content: args.content,
          metadata: args.metadata,
        });
        return jsonResult({
          ok: true as const,
          taskNoteId: args.taskNoteId,
          projectId: task.project_id,
          createdNoteId: created.id,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  mcp.registerTool(
    "nodex_write_note",
    {
      description:
        "Create or patch a note. Modes: patch_existing (PATCH), create_root | create_child | create_sibling (POST with relation).",
      inputSchema: writeNoteInput,
    },
    async (args) => {
      try {
        if (args.mode === "patch_existing") {
          const patch: {
            title?: string;
            content?: string;
            type?: string;
            metadata?: Record<string, unknown> | null;
          } = {};
          if (args.title !== undefined) {
            patch.title = args.title;
          }
          if (args.content !== undefined) {
            patch.content = args.content;
          }
          if (args.type !== undefined) {
            patch.type = args.type;
          }
          if (args.metadata !== undefined) {
            patch.metadata = args.metadata;
          }
          const note = await client.patchNote(args.noteId, patch);
          return jsonResult({ ok: true as const, note });
        }
        const relation =
          args.mode === "create_root"
            ? ("root" as const)
            : args.mode === "create_child"
              ? ("child" as const)
              : ("sibling" as const);
        const anchorId = args.mode === "create_root" ? undefined : args.anchorId;
        const body = {
          type: args.type,
          relation,
          anchorId,
          title: args.title,
          content: args.content,
          metadata: args.metadata,
        };
        const created = await client.createNote(args.projectId, body);
        return jsonResult({ ok: true as const, created });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return errorResult(msg);
      }
    },
  );

  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}
