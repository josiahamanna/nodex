import * as fs from "fs";
import * as path from "path";
import {
  getChildren,
  notes,
  setChildren,
  syncNullChildOrderFromRecords,
  type NoteRecord,
} from "./notes-store-core";
import { renameNote, setNoteContent } from "./notes-store-duplicate-create";

const DEFAULT_RELATIVE_DIR = path.join("docs", "bundled-plugin-authoring");
const ABOUT_NODEX_RELATIVE_FILE = path.join("docs", "about-nodex.md");
const ABOUT_NODEX_NOTE_ID = "nodex-docs:about-nodex";

export type BundledDocsManifest = {
  version: number;
  folder: {
    id: string;
    title: string;
  };
  pages: Array<{
    id: string;
    file: string;
    title: string;
  }>;
};

function resolveDocsDir(): string {
  const env = process.env.NODEX_BUNDLED_DOCS_DIR?.trim();
  if (env) {
    return path.resolve(env);
  }
  return path.resolve(process.cwd(), DEFAULT_RELATIVE_DIR);
}

function readManifest(dir: string): BundledDocsManifest | null {
  const p = path.join(dir, "manifest.json");
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw) as BundledDocsManifest;
    if (
      j &&
      typeof j.version === "number" &&
      j.folder &&
      typeof j.folder.id === "string" &&
      typeof j.folder.title === "string" &&
      Array.isArray(j.pages)
    ) {
      return j;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function upsertNote(rec: NoteRecord): void {
  const prev = notes.get(rec.id);
  if (!prev) {
    notes.set(rec.id, { ...rec });
    return;
  }
  prev.type = rec.type;
  prev.parentId = rec.parentId;
  prev.metadata = rec.metadata ? { ...rec.metadata } : undefined;
  renameNote(rec.id, rec.title);
  setNoteContent(rec.id, rec.content);
}

function ensureRootSibling(id: string): void {
  const roots = [...getChildren(null)];
  if (!roots.includes(id)) {
    roots.push(id);
    setChildren(null, roots);
  }
}

function ensureChildOf(parentId: string, childId: string): void {
  const ch = [...getChildren(parentId)];
  if (!ch.includes(childId)) {
    ch.push(childId);
    setChildren(parentId, ch);
  }
}

/**
 * Upserts bundled documentation notes from local markdown files (manifest-driven).
 * Safe to call on every workspace bootstrap / API server start: overwrites title/body from disk.
 *
 * @returns true if the notes store was modified (caller should persist SQLite).
 */
export function seedBundledDocumentationNotesFromDir(): boolean {
  const dir = resolveDocsDir();
  if (!fs.existsSync(dir)) {
    return false;
  }

  const manifest = readManifest(dir);
  if (!manifest || manifest.pages.length === 0) {
    return false;
  }

  let modified = false;
  const metaBase = {
    bundledDoc: true as const,
    manifestVersion: manifest.version,
  };

  const folderRec: NoteRecord = {
    id: manifest.folder.id,
    parentId: null,
    type: "markdown",
    title: manifest.folder.title,
    content:
      "# Documentation\n\nOpen a child note for plugin-authoring guides shipped with this repository.",
    metadata: { ...metaBase, bundledDocRole: "folder" },
  };

  const prevFolder = notes.get(folderRec.id);
  upsertNote(folderRec);
  ensureRootSibling(folderRec.id);
  if (
    !prevFolder ||
    prevFolder.title !== folderRec.title ||
    prevFolder.content !== folderRec.content
  ) {
    modified = true;
  }

  for (let i = 0; i < manifest.pages.length; i++) {
    const page = manifest.pages[i]!;
    const filePath = path.join(dir, page.file);
    if (!fs.existsSync(filePath)) {
      // eslint-disable-next-line no-console
      console.warn(`[Nodex] bundled docs: missing file ${page.file}`);
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const rec: NoteRecord = {
      id: page.id,
      parentId: manifest.folder.id,
      type: "markdown",
      title: page.title,
      content,
      metadata: {
        ...metaBase,
        bundledDocRole: "page",
        bundledDocOrder: i,
        sourceFile: page.file,
      },
    };

    const prevPage = notes.get(page.id);
    upsertNote(rec);
    ensureChildOf(manifest.folder.id, page.id);
    if (
      !prevPage ||
      prevPage.content !== content ||
      prevPage.title !== page.title
    ) {
      modified = true;
    }
  }

  // Extra bundled docs that aren't part of the plugin-authoring manifest.
  // These are still seeded into the SQLite notes tree so the Docs hub can display them.
  const aboutPath = path.resolve(process.cwd(), ABOUT_NODEX_RELATIVE_FILE);
  if (fs.existsSync(aboutPath)) {
    try {
      const content = fs.readFileSync(aboutPath, "utf8");
      const rec: NoteRecord = {
        id: ABOUT_NODEX_NOTE_ID,
        parentId: manifest.folder.id,
        type: "markdown",
        title: "About Nodex",
        content,
        metadata: {
          ...metaBase,
          bundledDocRole: "page",
          bundledDocOrder: -10,
          sourceFile: path.basename(ABOUT_NODEX_RELATIVE_FILE),
        },
      };

      const prev = notes.get(rec.id);
      upsertNote(rec);
      ensureChildOf(manifest.folder.id, rec.id);
      if (!prev || prev.content !== content || prev.title !== rec.title) {
        modified = true;
      }
    } catch {
      /* ignore */
    }
  }

  syncNullChildOrderFromRecords();
  return modified;
}
