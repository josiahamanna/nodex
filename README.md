# Nodex

**Nodex** is a desktop app for keeping notes and small projects in one place—and shaping how they behave. You work in a normal tree of notes, but each note can use a different editor or view (markdown, rich text, code, and more) depending on **plugins** you install or build yourself.

This repository is a **proof-of-concept**: it shows how that idea can work as a real Electron app with a safe boundary between the core shell and third-party UI.

---

## What you can do

- **Open a project folder** — Your workspace is a directory on disk. Notes live in a local database; files you attach or reference can sit alongside them (for example under `assets/`).
- **Write and organize notes** — Create, rename, move, and delete notes in a sidebar. Pick the note type that fits the content.
- **Edit plugins inside the app** — The **Plugin IDE** lets you open a plugin folder, edit source with a built-in editor, install dependencies, bundle, and reload so new behavior shows up without rebuilding the whole app.

If you only want to try the app, you only need the **Getting started** steps below. If you want to develop plugins, explore the `plugins/` directory and use Plugin IDE from the UI.

---

## Getting started

**Requirements:** Node.js 18+ and npm.

```bash
npm install
npm start
```

That launches the desktop app in development mode.

To produce a packaged build:

```bash
npm run package
```

Other useful commands: `npm run make` (installers), `npm run lint` (ESLint).

---

## Plugins

Plugins add **note types** (what shows when you open a note) and related tooling. Bundled and sample plugins live under `plugins/` (for example `plugins/user/markdown`). The exact layout and manifest format evolve with the project; the Plugin IDE and **Plugin Manager** inside the app are the best place to see what this build expects.

For a deeper dive into how the shell talks to plugins and what is validated at the boundary, see **[SECURITY.md](./SECURITY.md)**.

---

## License

ISC
