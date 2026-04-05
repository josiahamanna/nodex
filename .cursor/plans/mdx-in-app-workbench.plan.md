---
name: MDX in-app workbench
overview: Split MDX from markdown editing, single React preview, VFS path links, bundled docs on path-only hrefs. MDX may import only virtual @nodex/* facades (UI, date, etc.); real npm deps sit behind facades—pinned, reviewed, never raw dayjs/lodash imports from notes.
todos:
  - id: split-editor
    content: Register MdxNoteEditor only for mdx; keep MarkdownNoteEditor for markdown and root in useRegisterMarkdownNotePlugin.tsx
    status: completed
  - id: mdx-editor-ui
    content: New MdxNoteEditor with CodeMirror (MDX-oriented extensions), debounced compile, error panel, split preview beside editor
    status: completed
  - id: trust-imports
    content: Allow only @nodex/* virtual specifiers in workspace MDX; forbid direct imports from arbitrary package names; inject facade map into evaluate scope in MdxRenderer
    status: completed
  - id: nodex-ui-package
    content: Implement @nodex/ui facade (shadcn-style + Tailwind v4 tokens); register in mdxMap + evaluate scope
    status: completed
  - id: nodex-facades-registry
    content: Maintain single registry of @nodex/* facades (e.g. @nodex/date); each re-exports a pinned subset of one trusted dependency; document add/review process
    status: completed
  - id: tailwind-dynamic
    content: Decide and implement Tailwind strategy for user classNames in notes (safelist vs component-only); document in code comments
    status: completed
  - id: single-react-audit
    content: Verify MDX evaluate path uses only host react/jsx-runtime; no second React in dynamic chunks
    status: completed
  - id: vfs-path-index
    content: Build path-to-note resolver from explorer tree; define canonical path string rules, encoding, uniqueness
    status: completed
  - id: link-ux
    content: MDX links and import specifiers use VFS paths (explorer-aligned); insert-link picker shows tree paths
    status: completed
  - id: shell-routing-paths
    content: Add path-based shell routes for docs; drop
    status: completed
  - id: migrate-bundled-docs-links
    content: Rewrite bundled .md/.mdx link targets to VFS paths; update DocLink/docs hub if needed; align bundled-docs-seed paths with canonical VFS scheme
    status: completed
  - id: tests
    content: Tests for trust plugin, path href parsing, doc shell routes; forbidden import cases
    status: completed
isProject: true
---

# MDX in-app workbench

## Goals

- **Different editor for `mdx`** than for `markdown` / `root`: CodeMirror tuned for MDX/JSX, live preview alongside source.
- **Single React instance**: Preview runs as an **in-app subtree** in the same Electron renderer; MDX compilation must use the host’s `react`, `react-dom`, and `react/jsx-runtime` (no nested copy of React in a preview bundle).
- **Curated UI without user npm**: Expose `@nodex/ui` — repo-owned, **shadcn-style** (accessible primitives + **Tailwind v4** design tokens aligned with the shell). Authors do not run `npm install` for notes.
- `**@nodex/`* facade-only imports (decision)**: Note-authored MDX may use **only** virtual modules under `@nodex/`* (e.g. `@nodex/ui`, `@nodex/date`). Each facade is implemented in-repo, may depend on a **pinned** trusted npm package, and **re-exports a narrow API**. Authors never `import` raw package names (`dayjs`, `lodash`, …) from MDX.
- **Trust model**: **Compile-time allowlists** (forbidden AST nodes, allowlisted `import` specifiers only). A preview `<div>` is **not** a security boundary; this model suits **trusted workspace** content.
- **VFS-aligned addressing**: Authors use **paths that match the notes explorer tree**; a resolver maps `path → noteId` for navigation, IPC, and (later) relative MDX imports. Raw ids are implementation detail, not the primary authoring surface.
- **Defer**: Arbitrary **direct** registry imports from note content; unbounded dynamic `import()`; multi-file ESM across the open internet.

## Current code (baseline)


| Area                                         | Location                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Same editor for md/mdx/root                  | [useRegisterMarkdownNotePlugin.tsx](src/renderer/shell/first-party/plugins/markdown/useRegisterMarkdownNotePlugin.tsx)                      |
| Markdown note editor                         | [MarkdownNoteEditor.tsx](src/renderer/shell/first-party/plugins/markdown/MarkdownNoteEditor.tsx)                                            |
| MDX preview pipeline                         | [MdxRenderer.tsx](src/renderer/components/renderers/MdxRenderer.tsx) (`evaluate` from `@mdx-js/mdx`, `MDXProvider`, `mdxMap`)               |
| Routing markdown vs MDX                      | [MarkdownRenderer.tsx](src/renderer/components/renderers/MarkdownRenderer.tsx), [note-mdx-format.ts](src/renderer/utils/note-mdx-format.ts) |
| Workspace trust (no ESM / expressions today) | [remark-nodex-mdx-trust.ts](src/renderer/utils/remark-nodex-mdx-trust.ts)                                                                   |
| MDX embed components                         | [mdx-embed-components.tsx](src/renderer/components/renderers/mdx-embed-components.tsx) (`DocLink`, etc.)                                    |
| Bundled doc seed                             | [bundled-docs-seed.ts](src/core/bundled-docs-seed.ts) + `docs/bundled-plugin-authoring/` sources                                            |
| Internal note links (today)                  | [markdown-internal-note-href.ts](src/shared/markdown-internal-note-href.ts) — `#/n/<noteId>[/slug]`; plan moves **authoring** to VFS paths  |
| Shell = React subtrees                       | [ShellViewHost.tsx](src/renderer/shell/views/ShellViewHost.tsx)                                                                             |


`MdxRenderer` already passes host runtimes into `evaluate`:

```188:194:src/renderer/components/renderers/MdxRenderer.tsx
        const mod = await evaluate(src, {
          ...mdxReact,
          ...runtime,
          baseUrl: mdxBaseUrl(),
          remarkPlugins: [...remarkPlugins],
          development: process.env.NODE_ENV === "development",
        });
```

Extend this with an explicit `scope` (or equivalent) for allowlisted virtual imports once trust rules permit them.

## Virtual file system (explorer paths) — links and imports

**Yes, you can** orient MDX (and markdown) around a **virtual file system** whose paths match the **notes list tree** in the explorer, instead of asking authors to paste raw `noteId`s.

### Model

- **VFS paths** are a **stable, human-readable addressing layer** derived from the same hierarchy the explorer shows (e.g. `/Notes/Design/Auth.mdx` — exact rules: segment separator, file extension in path or omitted, case sensitivity — **define one canonical scheme**).
- **Notes still have stable `id`s in persistence**; the VFS is an **index + resolver**: `path → noteId` (and `noteId → path` for display). The explorer tree is the **source of truth** for how paths are built.

### Uses

1. **Markdown/MDX links**: Authors write `[label](/w/...)` or `nodex://vfs/...` or whatever scheme you standardize; navigation resolves path → open note (same as clicking a tree node).
2. **Allowlisted relative imports** (later phase): `import M from './Sibling.mdx'` resolves via VFS relative to the **current note’s path**, still without disk `node_modules`.

### Issues and mitigations


| Issue                                                      | Mitigation                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rename / move / reparent** changes path; old links break | **Hybrid**: resolve paths at **click time** from current tree; optionally keep **aliases** (old path → noteId) on rename; or periodic “fix broken links” using id-backed metadata.                                                                           |
| **Duplicates** (two notes same path)                       | Enforce **unique paths** when building the index; reject or disambiguate in UI.                                                                                                                                                                              |
| **URL / href encoding**                                    | Encode segments; document reserved characters; match shell hash parser ([shellTabUrlSync](src/renderer/shell/shellTabUrlSync.ts) area).                                                                                                                      |
| **Performance**                                            | Cache path ↔ id map; invalidate on tree mutations (same events that refresh explorer).                                                                                                                                                                       |
| **Backlinks / search**                                     | Index can store path at index time or resolve id → path when rendering.                                                                                                                                                                                      |
| **Today’s `#/n/<noteId>`**                                 | **Documentation (bundled)**: migrate **off** id-based hrefs to **VFS paths only** (repo-controlled sources). **Workspace user notes**: optional later migration or short dual-parse window if you still need backward compatibility for existing DB content. |


### Recommendation

- **Authoring UX**: path-primary (matches mental model “files in a project”).
- **Storage / routing implementation**: resolve to `noteId` before IPC and tab state, so existing note APIs keep working.

### Documentation notes — migrate early (no dual id-based links)

**Decision (product)**: For **bundled documentation** (seeded from repo, `bundledDoc` metadata, e.g. [bundled-docs-seed.ts](src/core/bundled-docs-seed.ts) and files under `docs/`), **yes — migrate now** to path/VFS-based links and **do not keep** `#/n/<noteId>` as the authoring format in those sources.

**Why this is feasible first**

- Sources live **in git** ([docs/bundled-plugin-authoring/](docs/bundled-plugin-authoring/), etc.), so you can **mechanically replace** link targets in `.md` / `.mdx` and re-seed.
- Tree structure for bundled docs is **deterministic** from manifest + folder layout, so VFS paths can be defined to **match** how the documentation hub / explorer presents them.
- No need to rewrite **user workspace** databases in the same release unless you choose to.

**Implementation notes**

- Update internal links in MDX/markdown bodies, [DocLink](src/renderer/components/renderers/mdx-embed-components.tsx) usage patterns, and any hard-coded navigation in [DocumentationHubView.tsx](src/renderer/shell/first-party/plugins/documentation/DocumentationHubView.tsx) / shell hash tests ([documentationShellHash.test.ts](src/renderer/shell/first-party/plugins/documentation/documentationShellHash.test.ts)) to the **new path route shape**.
- After migration, **parsers and UI for the doc surface** can assume **path-only** hrefs; drop id-based doc links in **new** content (old user bookmarks to `#/n/...` may still need one release of redirect or remain broken if you accept that for docs only).

**Workspace notes (non-bundled)**

- If existing projects store many `#/n/<id>` links in the DB, either run a **one-time migration** using a path index, or keep **temporary** parsing of `#/n/` **only for workspace** until migrated. This plan does **not** require dropping id routes globally on day one—only **bundled doc sources** commit to path-only authoring.

## Architecture

```mermaid
flowchart TB
  subgraph editor [MdxNoteEditor]
    CM[CodeMirror MDX]
    Src[note.content string]
    VfsIdx[path index from explorer tree]
    CM --> Src
    VfsIdx -.->|resolve links imports| Src
  end
  subgraph preview [Same renderer process]
    Trust[remarkNodexMdxTrust + allowlist]
    Eval[mdx evaluate host jsx-runtime]
    Tree[MDXProvider + Content]
    Src --> Trust
    Trust --> Eval
    Eval --> Tree
    Ui[@nodex/ui + mdxMap]
    Tree --> Ui
  end
  R[Single react react-dom]
  R --- Eval
  R --- Tree
```



## Implementation phases

### Phase 1 — Split editors

- In [useRegisterMarkdownNotePlugin.tsx](src/renderer/shell/first-party/plugins/markdown/useRegisterMarkdownNotePlugin.tsx), register `MarkdownNoteEditor` only for `markdown` and `root`; register a new `MdxNoteEditor` for `mdx`.
- New file (suggested): `src/renderer/shell/first-party/plugins/markdown/MdxNoteEditor.tsx` (or `plugins/mdx/MdxNoteEditor.tsx` if you prefer a folder split).
- Reuse persistence patterns from `MarkdownNoteEditor` (debounced save, blur flush) and theme from [ThemeContext](src/renderer/theme/ThemeContext.tsx).

### Phase 2 — MdxNoteEditor UX

- CodeMirror: base markdown + JSX-aware highlighting where feasible; align diagnostics messages with what `evaluate` will reject.
- Layout: editor | preview (responsive stack on small widths).
- Preview: render existing `MdxRenderer` with the same `note` object but **live** `content` from editor state (or a transient preview note object) so typing updates preview without waiting for store save, if product wants that — otherwise debounce save and pass `note` from parent (simpler).

### Phase 3 — Trust, `@nodex/*` facades, and `@nodex/ui`

- **Relax** workspace rules only for imports whose specifier matches `**@nodex/*`** per the **facade registry** documented in *Curated npm / @nodex/* facade policy* below (no `dayjs`, `lodash`, scoped org packages, or URLs). Keep blocking dynamic `import()` and dangerous expression patterns you still consider out of scope.
- Implement `**@nodex/ui`** under `src/renderer/...` (shadcn-style primitives + Tailwind tokens); add other facades (`**@nodex/date**`, etc.) as thin re-exports over **one pinned** dependency each, with **minimal surface**.
- In `evaluate`, pass a `scope` / virtual module table mapping **only** `@nodex/*` imports to those implementations (per `@mdx-js/mdx` version).
- Merge or migrate existing [mdx-embed-components.tsx](src/renderer/components/renderers/mdx-embed-components.tsx) tags into the public surface so old notes keep working.

### Phase 4 — Tailwind and dynamic class names

- If authors may write raw `className` utilities in MDX, ensure Tailwind v4 **sees** those classes (safelist or documented subset) — note content often lives in the DB, not on disk, so **content globs alone may miss strings**.
- Prefer **styling through `@nodex/ui`** for v1; document any allowed raw utilities.

### Phase 5 — Redux and global state (policy)

- Default: **do not** expose `react-redux` or raw store to user MDX imports; pass data via **props on wrapper components** or a small **documented context** provided by the host.
- If product later requires store access, document it as **privileged** and allowlist carefully.

### Phase 6 — VFS paths, links, and shell routing

- Define **canonical VFS path** format (aligned with explorer: parent chain + title/slug; document extension and case rules).
- Build a **path ↔ noteId index** from the same data the explorer uses; invalidate on tree changes.
- **MDX/Markdown authoring**: insert links that encode **paths** (not raw ids); picker shows **tree paths** like the explorer.
- **Navigation**: extend shell hash / route parsing (see [shellTabUrlSync](src/renderer/shell/shellTabUrlSync.ts) and internal link handling) so `href`s resolve **path → noteId → open note** (optional heading slug unchanged in concept).
- **Bundled documentation migration (priority)**: replace all `#/n/<noteId>` (and equivalent) in **repo** doc sources with **VFS path** hrefs; update doc hub / companion navigation and tests. **Do not** preserve id-based authoring for new bundled content.
- **Workspace**: optional dual-parse for legacy `#/n/<noteId>` in user notes until migrated, or a DB migration script — product choice independent of bundled-doc path-only commitment.
- **Broken links**: on rename/move, either maintain **aliases**, or surface diagnostics in editor preview listing stale paths.

### Phase 7 — Verification

- **Single React**: search built output / dynamic imports for accidental second `react` in MDX-only chunks; use bundler `resolve.dedupe` or externals if a compile step is added later.
- **Tests**: path ↔ id resolver (rename/move edge cases), new href parsing, plus trust plugin tests for forbidden vs allowed imports; mirror [documentationShellHash.test.ts](src/renderer/shell/first-party/plugins/documentation/documentationShellHash.test.ts) style for shell routes.

## Curated npm / `@nodex/*` facade policy

**Authoring rule**: MDX `import` specifiers visible to note authors are `**@nodex/*` only**. Adding a library means: add it to **app** `package.json`, implement `**src/.../nodex-facades/<name>.ts`** (or similar) that re-exports a **small** API, register it in the **facade registry** and in `evaluate` scope, update docs.

**Criteria for packages allowed behind a facade** (opinionated):

- **Pure / predictable**: no global monkey-patches, no network-by-default, no `eval` / remote script loading in normal paths.
- **No native addons / dodgy postinstall** (or explicitly audited).
- **Small transitive tree**; **pinned** versions; **license** OK for shipping in the desktop app.
- **React-friendly**: correct `react` peers; does not bundle a second React.
- **Prefer** formatting, date, `clsx`-class utilities, or **host-wrapped** chart/i18n — **avoid** exposing routers, full state libraries, or “platform” deps raw to notes.

**Avoid behind facades** (unless wrapped tightly): analytics, filesystem/electron bridges, polyfills that patch globals, huge kitchen-sink libraries.

**Why facades**: supply-chain and API control; swap `dayjs` → `date-fns` without rewriting notes; keep trust plugin to **prefix `@nodex/`** instead of an ever-growing string list of npm names.

## Non-goals (v1)

- iframe sandboxed preview
- **Direct** `import 'any-registry-package'` from user MDX (everything goes through `@nodex/`*)
- Vue MDX pipeline

## Doc pointer

- First-party plugin patterns: [docs/bundled-plugin-authoring/04-plugin-authoring-complete-guide.md](docs/bundled-plugin-authoring/04-plugin-authoring-complete-guide.md)

