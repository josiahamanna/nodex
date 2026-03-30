# Project workspace.


This document describes the operation of Nodex through workspace and projects.
We can have multiple workspaces. Each workspace have multiple projects.

## Examples
### Workspace Projects relationship
Consider a workspace called "Personal"
Personal can have multiple projects like -> journal, family, Books, Calendar, coding.

Consider another workspace called "Work"
Work can have multiple projects like Client-A, Client-B  etc

### Projects notes relationshiop
Projects can have multiple notes. Each notes can be catergorised based on the content.
The notes can nest with each other. They can be linked with each other through references and backlinks.
For example Family projects can have many notes.
Inventories, Kitchen, Planning, shedules.

Each notes can have image, videos, pdfs, drawings, text and many so types and references.


## Launching the app for the first fime.
1. The app must ask for the root folder or the workspace directory to be set which will get stored in userData.
2. After selecting the root folder workspace, which is throught file dialog, rest of the folders and files must created with in Nodex.
3. You should able to create projects, notes, And all the crud operation like cut/copy/delete/rename/move/drag/drop/remove/hide.
4. Remove is to remove the a workspace( you can also provide delete operation). hide is to hide  project. ( it should go to hidden section with that workspace)

## Assets and project tree
1. When the assets folder is clicked, there should be an option to open the containing folder in the system file manager.
    a. The same “open containing folder” action should be available from the context menu when right-clicking a file or folder in the tree.
    b. Opening the containing folder should also apply when clicking any note in the project folder (and for the project root).
2. When assets from the assets folder are dragged onto the project folder, a note should be created with the corresponding file type. If the file type is not recognized, an error toaster should show: file type not supported.
