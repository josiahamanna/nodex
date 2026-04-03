# The Nodex workbench: layout and regions

Nodex is organized like a desktop IDE: a narrow **activity** strip, a **sidebar**, a large **main** column, and an optional **companion** column. Together they let you browse notes, edit content, and open helper panels without losing context.

## Activity bar (menu rail)

The **activity bar** is the vertical strip on the far left with icons (for example **N** for Welcome, **≡** for Notes, **?** for Documentation).

- Each icon is a **rail item** registered by a feature or plugin.
- Clicking an item typically opens or focuses a **tab** in the main area and can automatically show the matching **sidebar** view (for example Notes opens the tree in the sidebar).
- You can hide or show the activity bar from the shell layout controls when you need more horizontal space.

In conversation you may hear “activity panel”; in this app the same idea is the **activity bar** / **menu rail**.

## Side panel (primary sidebar)

The **side panel** is the region to the right of the activity bar. It hosts **sidebar views** such as:

- **Notes — explorer**: workspace, projects, and the note tree.
- **Docs — search**: filterable list of bundled guides and shell commands (when the Documentation tab is active).

The sidebar can be **resized** and **collapsed**. Which sidebar appears often follows the **active tab** so you do not keep the wrong tool open next to unrelated content.

## Main area

The **main area** is the central column. It shows the **primary view** for the active tab: a note editor, the Welcome screen, an Observable notebook surface, or the Documentation reader.

Only one main view is focused at a time per tab stack; switching tabs swaps the main content (and may swap sidebar/companion views tied to that tab type).

## Companion column

The **companion** is the optional column on the right (for example **Outline** next to a Markdown note, or **Docs — settings** next to the Documentation hub).

Tab types can declare a **secondary view** so the companion opens or closes when you switch tabs. Use it for metadata, settings, or contextual tools that should stay visible beside the editor.

## Bottom area

Some layouts also support a **bottom** dock region for panels that attach under the main editor. Not every tab uses it; it is reserved for features that register bottom views.

## How the pieces work together

1. Pick a feature from the **activity bar**.
2. The shell opens the right **tab** and usually the matching **sidebar**.
3. The **main area** shows the editor or hub for that feature.
4. If the tab defines one, the **companion** shows a secondary tool (outline, docs settings, and so on).

The next guides cover **workspaces and notes**, **commands and tabs**, and **Notes / Observable / Documentation** in more detail.
