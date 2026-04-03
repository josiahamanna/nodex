# Mini bar, command palette, and tabs

Beyond clicking the UI, Nodex exposes actions as **commands**. The **mini bar** and **command palette** are two ways to run them. **Tabs** tie commands and views into focused workspaces.

## Mini bar (minibuffer)

The **mini bar** is the compact input usually shown near the top or bottom of the shell (Emacs users can think of it as **M-x**-style entry).

- Type a **command id** (or a prefix). Matching commands that are allowed in the mini bar appear as suggestions.
- **Execute** the highlighted command to run it.
- Some commands take **arguments**; the host may prompt or use the typed remainder of the line.

In **Documentation → Docs — settings** (companion column), the **Minibuffer-only** toggle filters the **Commands** list in the sidebar to commands that opt into the mini bar (`miniBar !== false`). Turn it off to browse every registered command while searching.

## Command palette

The **command palette** is the broader searchable list of **registered commands** (titles, categories, ids). Open it from the shell (keyboard shortcut or app menu, depending on your build).

- Palette entries come from **plugins** and core shell registration; each command should include a short **doc** string for humans and optional **API** metadata for the Documentation hub.
- Choosing an item **invokes** the command handler (same as the mini bar, with a different UX).

Use the palette when you do not remember the exact id; use the mini bar when you prefer typing ids quickly.

## Tabs

**Tabs** represent open **tab types** in the main column: Welcome, Note, Notes explorer hub, Observable notebook, Documentation, and so on.

- Each **tab type** is registered with a **main view**, and optionally **primary sidebar** and **secondary (companion)** views. When you activate the tab, the shell aligns the sidebar and companion with that feature.
- **Reuse keys** let the shell open **one tab per logical session** (for example a single Documentation tab) instead of duplicating identical tabs.
- Closing a tab disposes that instance; the activity bar can open it again.

### Tab strip behavior

- Reorder tabs when the UI allows drag-and-drop (implementation-dependent).
- The **active tab** controls which main view is visible and often which sidebar view is shown.

## Practical flow

1. **Notes**: open the **Notes** rail item → **Notes** tab + explorer sidebar → pick a note.
2. **Docs**: open **Documentation** → **Docs** tab + **Docs — search** sidebar + **Docs — settings** companion → pick a guide or command.
3. **Commands**: open the palette → run **Notes: Open explorer** or **Docs: Open documentation** without touching the rail.

The following guide compares **Notes (explorer)**, **Observable**, and **Documentation** as products of those tabs and sidebars.
