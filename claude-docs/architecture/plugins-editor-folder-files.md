# file/folder structure.

1. The file system hirarchy with drag and drops, cut, copy paste, rename, delete operation should happen withing the given plugins directory. We can drag drop files folders(while holding shift to duplicate while dragging), copy , cut paste, rename delete between any pluggin directory system. The same opeariton should apprear in context menu.

2. Nodex should watch for file changes. if the file is modified externally then the changs should reflect here immediately. if the file is not saved, then a error warning should show up saying that there is a new version of the file in disk.

3. There must be a button to open the given plugin folder in vscode, windsurf, cursor and anigravity. The same folder space should reflect there. Its equivent to navigation to a plugin directory and typing "code .", "windsurf ." or "cursor .". Add this in the top right corner of the editor panel as a dropdown.

4. I need a option to initzie the folder if an empty folder is opened. it should do npm init, create .nodexplugin, tsconfig.json, prettierrc.json and src folder with main.ts, ui.tsx, manifest.json, etc. 

5. point 3,and 4 is for those who wants to do developemtn outside of nodex to leverage AI functionalites.

6. We need to create and publish npm package that will be used in the project instead of having hardcoded path. We shall remove any dependecis from the nodex source code so that the plugin developeemmtn is done independenlty.

7. Provide an option to full preview the application in nodex during development. this will help the developers developing it outside of nodex to have the best possible debugging experience and viewing expeince. As the debug tools both node and browser is presnt in Nodex.

8. Ability to select the files and folder in bulk too in editor.