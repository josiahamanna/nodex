# Pluggins issues.

Here is the thing. Our application is written in a pluggable way and the applications is the platform to develop the pluggins/test them, build them and finally distribute them(pluggins).

1st question where will the actual plugins live in the system used by nodex as a production build?
second question, how will the development process be like? Where will the source code and dev build(souce code zipped) live and reside in the system?
What happens when the user wants to really install it as a production build or generate a production grade plugin?
What options should we provide during the plugin development?
All should have keyboard shortcuts.
1. Load a directory. Every plugin directory has a .nodexplugin file in that. Hence if a directory is loaded, it will scan the first level depth where it find a .nodexplugin file. It will scall for all the folders in the depth 1 where the .nodexplugin is found. The listed plugins should be listed in dropdown and selected for development one at a time.
2. Open a file. To import a file (tsx, jsx, md, js, ts, json, .nodexplugin etc)
3. Create a new file and folder.
4. Delete file/folder.
5. Rename file/folder
6. Copy file/folder
7. paste file/folder.
8. Search for npm packages. On select they shoudl appear as a list to be installed. 
9. should be able to mark it as dev dependency.
10. Install dependices. Also from the list ablity to remove dependency and refresh the dependcy modules
11. Compile pluggin.
12. load plugin
13. Compile and load.
14. Bundle plugin. after sucessful bundling it should ask the folder location to save.
15. File watchers. Should listen to changes in the files/folders.
16. Check for type errors button.

No need to add styling for the application. Do the bare minimum. We will later build the theming system.