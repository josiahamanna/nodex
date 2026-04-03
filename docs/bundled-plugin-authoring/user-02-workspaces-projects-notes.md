# Workspaces, projects, and notes

Nodex stores your work in a **workspace → project → note** hierarchy (the WPN model). Understanding these three levels makes it easier to organize content and find items in the **Notes** explorer.

## Workspace

A **workspace** is the top-level container. It groups related **projects** (and all of their notes).

### Creating a workspace

- Open the **Notes** activity (rail icon **≡**) so the **Notes — explorer** sidebar is visible.
- Use the workspace actions in the explorer (for example **New workspace** / create flow). On desktop, creating a workspace may prompt you to **choose a folder** so files and databases stay on disk together.
- After creation, the new workspace appears in the tree; expand it to see its projects.

Workspaces help you separate contexts (personal notes, a client, a product) without mixing trees.

## Project

A **project** lives inside exactly one workspace. It is a folder-like grouping for **notes**.

### Creating a project

1. In the explorer, expand the target **workspace**.
2. Use the project creation action for that workspace (context menu or toolbar, depending on build).
3. A default name such as **Project** may be assigned; rename it to match your use (for example **Meeting notes**, **Research**).

Server deployments may also seed a **Documentation** project that holds bundled read-only guides.

## Note

A **note** is a single document inside a **project**. Notes have a **type** (for example `markdown`, `observable`) that decides which editor opens in the main area.

### Creating a note

1. Select a **project** in the explorer so its tree is loaded.
2. Choose **New note** (or add child / sibling, depending on UI).
3. Pick a **note type** from the picker when prompted.
4. The shell opens a **Note** tab (or reuses one) and focuses the new note in the editor.

You can organize notes in a **tree** (parent/child), rename them, and delete them from the explorer. Actions that affect structure usually apply to the **selected project**.

### Opening a note

- **Click** the note in the explorer, or
- Use **command palette** / **mini bar** commands such as **Notes: Open note by id** when you know the id.

## Tips

- Keep **one project** for daily notes and add more projects when boundaries are clear (work vs personal, or per initiative).
- The **Documentation** project (when present) is for shipped guides; your editable notes live in your own projects.
- If the explorer looks empty, confirm a **workspace** is expanded and a **project** is selected.
