# IDE experience (Plugin IDE)

Enhance the in-app plugin authoring experience.

## TypeScript editor

- First-class editing for `.ts` / `.tsx` in Monaco (language mode, formatting, bracket matching).
- Align bundler / manifest so plugin `ui` can point at `ui.tsx` (and optionally `main` at `.ts` later) without authors fighting the toolchain.
- Monaco TypeScript worker options tuned for hybrid plugins: `moduleResolution`, `jsx`, `allowJs` where UI mixes JS and TS.

## Built-in TypeScript compiler

- **v1 preference:** both layers — Monaco TS worker for **inline** squiggles and completions while editing, plus **`tsc --noEmit`** (main IPC) for **CLI-accurate** checks.
- Run `tsc` against the **plugin workspace** with a generated or checked-in `tsconfig.json` scoped to the plugin folder.
- Surface `tsc` diagnostics in the IDE: Problems list and/or markers synced with open files; “Check types” action and optional run-on-save toggle.
- Keep Monaco and `tsc` aligned on compiler options where possible to reduce conflicting diagnostics.

## Code suggestions (dropdown completions)

- Use Monaco’s completion API so **Ctrl+Space / auto** shows a **dropdown** of symbols, imports, and members (standard TS/JS IntelliSense).
- Load extra typings into the worker where possible: `@types/*` and dependencies from the plugin’s `node_modules` / install cache so `import 'react'` and plugin deps resolve with suggestions.
- Optional: npm-aware import completions (suggest installed package names and subpaths) layered on top of TS service.

## Other (existing bullets)

3. Suggestions for available npm — frontend (`tsx`, `jsx`) vs Node (`ts`, `js`) contexts (ranking, filters, or separate lists).
4. Play button to run, stop button to kill the app — define whether “run” means bundle+reload registry vs spawn plugin main; “stop” = cancel bundle/npm or kill child process.
