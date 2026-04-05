# Notes explorer, JS notebooks, and Documentation

Three first-party experiences cover most day-to-day use: browsing and editing structured notes, running **JS notebooks** backed by `@observablehq/runtime`, and reading **bundled documentation** plus command references.

## Notes (explorer)

**Purpose:** Manage **workspaces**, **projects**, and the **note tree**, and open notes in the **Note** editor.

- **Rail:** **Notes** (icon **≡**).
- **Sidebar:** **Notes — explorer** (tree, search, create/rename/delete).
- **Main:** **Notes** hub when you use the dedicated explorer tab, or **Note** editor when a note is open (depending on how you navigated).

**Typical tasks**

- Create workspace → project → note.
- Choose note **types** (Markdown, JS notebook, and others exposed by plugins).
- Reveal the current note in the tree after opening from a link or command.

Commands such as **Notes: Open explorer** jump you into this layout without clicking the rail.

## JS notebook

**Purpose:** Edit **JS notebook** notes: cells of code and prose backed by JSON in the note body, with `@observablehq/runtime` and stdlib for visualization and scripting.

- **Rail:** **JS notebook**.
- Opens a **JS notebook** tab with the notebook **main** view.
- Notebook notes are normal WPN notes whose **type** is `js-notebook`; create them from the explorer’s type picker.

**Typical tasks**

- Open **JS notebook: Open** from the palette to start or focus a notebook tab.
- Create a new **js-notebook** note in a project when you want a persistent notebook file in your tree.

The editor integrates code editing (including shortcuts such as run cell) and trusted execution paths; see in-app behavior for the exact keybindings in your build.

## Documentation

**Purpose:** Read **bundled guides** (read-only Markdown seeded from the repository) and inspect the **command API** (generated from command registrations).

- **Rail:** **Documentation** (icon **?**).
- **Sidebar:** **Docs — search** with two modes:
  - **Guides:** bundled documentation pages (User guide + Plugin authoring sections).
  - **Commands:** searchable list of commands; selecting one shows structured API text in the **main** hub.
- **Companion:** **Docs — outline** — table of contents for the documentation page in the main area.
- **Sidebar → Settings:** keyboard listing, `window.nodex.shell` shape, **About**, and buttons to open short **User guide** / **Plugin authoring** Markdown in the main area.

**Typical tasks**

- Filter **Guides** by title and open a page; it renders in the main area as **read-only** Markdown.
- Switch to **Commands**, filter (optionally **mini bar–only**), and inspect arguments and return types.
- Use **Docs: Open documentation** from the palette when you forget the rail icon.

Bundled guides refresh when the workspace or API server **reseeds** documentation from disk on bootstrap; your own project notes are unrelated unless you copy content manually.

## Choosing the right tool

| Need | Use |
|------|-----|
| Organize and edit project notes | **Notes** explorer + **Note** tab |
| Computational notebook cells | **JS notebook** tab + `js-notebook` notes |
| Product or plugin author docs | **Documentation** tab → **Guides** |
| Discover shell commands | **Command palette** or Documentation → **Commands** |

Together, these three surfaces share the same shell: **activity bar** choice → **tab** → **sidebar** / **main** / **companion** alignment.
