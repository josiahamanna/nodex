import * as path from "path";
import { Router, type Request, type Response, type NextFunction } from "express";
import {
  ensureNotesSeeded,
  createNote as createNoteInStore,
  getFirstNote,
  getNoteById,
  getNotesFlat,
  renameNote as renameNoteInStore,
  setNoteContent as setNoteContentInStore,
  setNotePluginUiState,
  deleteNoteSubtrees,
  duplicateSubtreeAt,
  moveNote as moveNoteInStore,
  moveNotesBulk as moveNotesBulkInStore,
} from "../core/notes-store";
import { MAX_NOTE_CONTENT_CHARS } from "../core/notes-store-duplicate-create";
import { saveNotesState } from "../core/notes-persistence";
import { nodexRedo, nodexUndo, pushNotesUndoSnapshot } from "../core/nodex-undo";
import type { Note } from "../shared/nodex-renderer-api";
import { isWorkspaceMountNoteId } from "../shared/note-workspace";
import { isValidNoteId, isValidNoteType } from "../shared/validators";
import {
  assertProjectOpen,
  getHeadlessUserDataPath,
  headlessRegisteredTypes,
  headlessSelectableNoteTypes,
  headlessWorkspaceRoots,
  getHeadlessProjectStateView,
} from "./headless-bootstrap";
import {
  getHeadlessSessionRegistry,
  installHeadlessMarketplacePlugin,
} from "./headless-marketplace-session";
import {
  filterMarketplaceIndexByExistingFiles,
  loadMarketplaceIndex,
} from "../shared/marketplace-index";

const MARKETPLACE_FILES_BASE = "/marketplace/files";

function resolveHeadlessMarketplaceDir(): string {
  const raw = process.env.NODEX_MARKETPLACE_DIR?.trim();
  if (raw) {
    return path.resolve(raw);
  }
  return path.resolve(process.cwd(), "dist", "plugins");
}

const MAX_NOTE_TITLE_CHARS = 4_000;

function persistHeadlessNotes(): void {
  try {
    saveNotesState();
  } catch (e) {
    console.warn("[Nodex API] saveNotesState failed:", e);
  }
}

type CommandDescriptor = {
  id: string;
  title: string;
  category?: string;
  sourcePluginId: string | null;
  palette: boolean;
  miniBar: boolean;
  doc: string | null;
};

const headlessCommands = new Map<
  string,
  (args?: Record<string, unknown>) => unknown
>();
headlessCommands.set("nodex.headless.ping", () => ({ ok: true as const }));

const commandDescriptors: CommandDescriptor[] = [
  {
    id: "nodex.headless.ping",
    title: "Nodex (headless): ping API",
    category: "Nodex",
    sourcePluginId: null,
    palette: false,
    miniBar: false,
    doc: "Returns { ok: true } when the HTTP command bridge is alive.",
  },
];

function withNotes(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  try {
    assertProjectOpen();
    ensureNotesSeeded(headlessRegisteredTypes());
    next();
  } catch (e) {
    res.status(503).json({
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function noteToApi(n: {
  id: string;
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Pick<Note, "id" | "type" | "title" | "content" | "metadata"> {
  const { id, type, title, content, metadata } = n;
  return { id, type, title, content, metadata };
}

export function createNodexApiRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.get("/marketplace/plugins", (_req, res) => {
    const marketDir = resolveHeadlessMarketplaceDir();
    const loaded = loadMarketplaceIndex(marketDir);
    if (!loaded.ok) {
      res.json({
        filesBasePath: MARKETPLACE_FILES_BASE,
        marketplaceDir: marketDir,
        generatedAt: "",
        plugins: [] as unknown[],
        indexError: loaded.error,
      });
      return;
    }
    const data = filterMarketplaceIndexByExistingFiles(marketDir, loaded.data);
    res.json({
      filesBasePath: MARKETPLACE_FILES_BASE,
      marketplaceDir: marketDir,
      generatedAt: data.generatedAt,
      plugins: data.plugins,
    });
  });

  router.post("/marketplace/session-install", async (req, res) => {
    try {
      const body = (req.body ?? {}) as { packageFile?: string };
      const raw =
        typeof body.packageFile === "string" ? body.packageFile.trim() : "";
      if (!/^[a-zA-Z0-9._-]+\.nodexplugin$/.test(raw)) {
        res.status(400).json({
          success: false,
          error: "packageFile must be a .nodexplugin basename (no paths)",
        });
        return;
      }
      const packageBasename = raw;
      const result = await installHeadlessMarketplacePlugin({
        marketplaceDir: resolveHeadlessMarketplaceDir(),
        packageBasename,
        userDataPath: getHeadlessUserDataPath(),
      });
      if (!result.success) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.post("/plugins/render-html", async (req, res) => {
    try {
      const body = (req.body ?? {}) as { type?: unknown; note?: unknown };
      if (!isValidNoteType(body.type)) {
        res.status(400).json({ error: "Invalid type" });
        return;
      }
      const note = body.note as Note;
      if (
        !note ||
        typeof note !== "object" ||
        !isValidNoteId((note as Note).id) ||
        !isValidNoteType((note as Note).type)
      ) {
        res.status(400).json({ error: "Invalid note" });
        return;
      }
      const renderer = getHeadlessSessionRegistry().getRenderer(
        String(body.type),
      );
      if (!renderer) {
        res.status(404).json({
          error: `No headless renderer for type "${String(body.type)}". Install the plugin from Market for this API session.`,
        });
        return;
      }
      const html = await Promise.resolve(renderer.render(note));
      if (typeof html !== "string" || !html.length) {
        res.status(500).json({ error: "Renderer returned empty HTML" });
        return;
      }
      res.json({ html });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.get("/plugins/renderer-meta", (req, res) => {
    const q = req.query.type;
    const type = typeof q === "string" ? q : "";
    if (!isValidNoteType(type)) {
      res.status(400).json({ error: "Invalid type" });
      return;
    }
    const renderer = getHeadlessSessionRegistry().getRenderer(type);
    if (!renderer) {
      res.json(null);
      return;
    }
    res.json({
      theme: renderer.theme ?? "inherit",
      deferDisplayUntilContentReady:
        renderer.deferDisplayUntilContentReady === true,
      designSystemVersion: renderer.designSystemVersion ?? null,
    });
  });

  router.get("/project/state", (_req, res) => {
    try {
      assertProjectOpen();
      res.json(getHeadlessProjectStateView());
    } catch (e) {
      res.status(503).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.get("/commands/registry", (_req, res) => {
    res.json({ commands: commandDescriptors });
  });

  router.post("/commands/:commandId/invoke", (req, res) => {
    const id = req.params.commandId;
    const fn = headlessCommands.get(id);
    if (!fn) {
      res.status(404).json({ error: "Unknown command id" });
      return;
    }
    try {
      const body = (req.body ?? {}) as { args?: Record<string, unknown> };
      const out = fn(body.args);
      res.json(out ?? {});
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.get("/notes/types/registered", withNotes, (_req, res) => {
    res.json({ types: headlessRegisteredTypes() });
  });

  router.get("/notes/types/selectable", withNotes, (_req, res) => {
    res.json({ types: headlessSelectableNoteTypes() });
  });

  router.get("/notes", withNotes, (_req, res) => {
    res.json(getNotesFlat());
  });

  router.get("/notes/detail", withNotes, (req, res) => {
    const q = req.query.id;
    const noteId =
      typeof q === "string" && q.length > 0 ? q : undefined;
    if (noteId !== undefined) {
      if (!isValidNoteId(noteId)) {
        res.status(400).json({ error: "Invalid note id" });
        return;
      }
      const note = getNoteById(noteId);
      if (!note) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      res.json(noteToApi(note));
      return;
    }
    const first = getFirstNote();
    if (!first) {
      res.json(null);
      return;
    }
    res.json(noteToApi(first));
  });

  router.post("/notes", withNotes, (req, res) => {
    const payload = req.body as {
      anchorId?: string;
      relation: string;
      type: string;
      content?: string;
      title?: string;
    };
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const { type } = payload;
    const selectable = headlessSelectableNoteTypes();
    if (!isValidNoteType(type) || !selectable.includes(type)) {
      res.status(400).json({ error: "Invalid note type" });
      return;
    }
    const rel = payload.relation;
    if (rel !== "child" && rel !== "sibling" && rel !== "root") {
      res.status(400).json({ error: "Invalid relation" });
      return;
    }
    let anchorId = payload.anchorId;
    if (anchorId !== undefined && !isValidNoteId(anchorId)) {
      res.status(400).json({ error: "Invalid anchor id" });
      return;
    }
    if (rel === "root") {
      anchorId = undefined;
    }
    if (payload.content !== undefined) {
      if (typeof payload.content !== "string") {
        res.status(400).json({ error: "Invalid content" });
        return;
      }
      if (payload.content.length > MAX_NOTE_CONTENT_CHARS) {
        res.status(400).json({ error: "Content too large" });
        return;
      }
    }
    if (payload.title !== undefined) {
      if (typeof payload.title !== "string") {
        res.status(400).json({ error: "Invalid title" });
        return;
      }
      if (payload.title.length > MAX_NOTE_TITLE_CHARS) {
        res.status(400).json({ error: "Title too long" });
        return;
      }
    }
    try {
      pushNotesUndoSnapshot();
      const created = createNoteInStore({
        anchorId,
        relation: rel,
        type,
        content: payload.content,
        title: payload.title,
      });
      persistHeadlessNotes();
      res.status(201).json({ id: created.id });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.patch("/notes/:noteId", withNotes, (req, res) => {
    const id = req.params.noteId;
    if (!isValidNoteId(id)) {
      res.status(400).json({ error: "Invalid note id" });
      return;
    }
    const body = req.body as {
      title?: string;
      content?: string;
      pluginUiState?: unknown;
    };
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const note = getNoteById(id);
    if (!note) {
      res.status(404).json({ error: "Note not found" });
      return;
    }
    let changed = false;
    try {
      if (body.title !== undefined) {
        if (typeof body.title !== "string") {
          res.status(400).json({ error: "Invalid title" });
          return;
        }
        pushNotesUndoSnapshot();
        renameNoteInStore(id, body.title);
        changed = true;
      }
      if (body.content !== undefined) {
        if (typeof body.content !== "string") {
          res.status(400).json({ error: "Invalid content" });
          return;
        }
        setNoteContentInStore(id, body.content);
        changed = true;
      }
      if (body.pluginUiState !== undefined) {
        setNotePluginUiState(id, body.pluginUiState);
        changed = true;
      }
      if (changed) {
        persistHeadlessNotes();
      }
      const next = getNoteById(id);
      if (!next) {
        res.status(404).json({ error: "Note not found" });
        return;
      }
      res.json(noteToApi(next));
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.post("/notes/delete", withNotes, (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "Invalid ids" });
      return;
    }
    for (const x of ids) {
      if (typeof x !== "string" || !isValidNoteId(x)) {
        res.status(400).json({ error: "Invalid note id" });
        return;
      }
    }
    const deletable = (ids as string[]).filter(
      (x) => !isWorkspaceMountNoteId(x),
    );
    if (deletable.length === 0) {
      res.status(204).end();
      return;
    }
    try {
      pushNotesUndoSnapshot();
      deleteNoteSubtrees(deletable);
      persistHeadlessNotes();
      res.status(204).end();
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.post("/notes/move", withNotes, (req, res) => {
    const payload = req.body as {
      draggedId: string;
      targetId: string;
      placement: string;
    };
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const { draggedId, targetId } = payload;
    if (!isValidNoteId(draggedId) || !isValidNoteId(targetId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const p = payload.placement;
    if (p !== "before" && p !== "after" && p !== "into") {
      res.status(400).json({ error: "Invalid placement" });
      return;
    }
    try {
      pushNotesUndoSnapshot();
      moveNoteInStore(draggedId, targetId, p);
      persistHeadlessNotes();
      res.status(204).end();
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.post("/notes/move-bulk", withNotes, (req, res) => {
    const payload = req.body as {
      ids: string[];
      targetId: string;
      placement: string;
    };
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const { ids, targetId } = payload;
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "Invalid ids" });
      return;
    }
    for (const x of ids) {
      if (typeof x !== "string" || !isValidNoteId(x)) {
        res.status(400).json({ error: "Invalid note id" });
        return;
      }
    }
    if (typeof targetId !== "string" || !isValidNoteId(targetId)) {
      res.status(400).json({ error: "Invalid target id" });
      return;
    }
    const p = payload.placement;
    if (p !== "before" && p !== "after" && p !== "into") {
      res.status(400).json({ error: "Invalid placement" });
      return;
    }
    try {
      pushNotesUndoSnapshot();
      moveNotesBulkInStore(ids as string[], targetId, p);
      persistHeadlessNotes();
      res.status(204).end();
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.post("/notes/paste", withNotes, (req, res) => {
    const payload = req.body as {
      sourceId: string;
      targetId: string;
      mode: string;
      placement: string;
    };
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const { sourceId, targetId, mode, placement } = payload;
    if (!isValidNoteId(sourceId) || !isValidNoteId(targetId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (mode !== "cut" && mode !== "copy") {
      res.status(400).json({ error: "Invalid mode" });
      return;
    }
    if (
      placement !== "before" &&
      placement !== "after" &&
      placement !== "into"
    ) {
      res.status(400).json({ error: "Invalid placement" });
      return;
    }
    try {
      if (mode === "cut") {
        pushNotesUndoSnapshot();
        moveNoteInStore(sourceId, targetId, placement);
        persistHeadlessNotes();
        res.json({});
        return;
      }
      pushNotesUndoSnapshot();
      const { newRootId } = duplicateSubtreeAt(
        sourceId,
        targetId,
        placement,
      );
      persistHeadlessNotes();
      res.json({ newRootId });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  router.post("/undo", withNotes, (_req, res) => {
    const roots = headlessWorkspaceRoots().map((w) => path.resolve(w));
    if (roots.length === 0) {
      res.status(400).json({
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      });
      return;
    }
    const r = nodexUndo(roots);
    if (!r.ok) {
      res.json({
        ok: false as const,
        error: r.error ?? "Undo failed",
        touchedNotes: false as const,
      });
      return;
    }
    if (r.touchedNotes) {
      persistHeadlessNotes();
    }
    res.json({ ok: true as const, touchedNotes: r.touchedNotes === true });
  });

  router.post("/redo", withNotes, (_req, res) => {
    const roots = headlessWorkspaceRoots().map((w) => path.resolve(w));
    if (roots.length === 0) {
      res.status(400).json({
        ok: false as const,
        error: "No workspace open",
        touchedNotes: false,
      });
      return;
    }
    const r = nodexRedo(roots);
    if (!r.ok) {
      res.json({
        ok: false as const,
        error: r.error ?? "Redo failed",
        touchedNotes: false as const,
      });
      return;
    }
    if (r.touchedNotes) {
      persistHeadlessNotes();
    }
    res.json({ ok: true as const, touchedNotes: r.touchedNotes === true });
  });

  return router;
}
