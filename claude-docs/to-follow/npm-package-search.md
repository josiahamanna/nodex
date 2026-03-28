async function searchNpm(query) {
  const res = await fetch(
    `https://registry.npmjs.org/-/v1/search?text=${query}`
  );
  const data = await res.json();
  return data.objects.map(o => o.package);
}

Then:
    debounce input
    show dropdown
    maybe rank by downloads/stars

This must be implemented by the monaco-editor -core plugin. This is how we search a npm package and add them to the package.json.
when the project is switched then the package dropdown should contain respective packages.
The same dropdown will be used to search for new pakages and the existing packages, intelligently.


The side bar ot the left should also be slidable. or specifically collapsable and there must be an ability toggle expand and collapse

Is there a another way to write the markdown editor preview pluggin. Remove the current one. 

When i click on New file/New folder i get this error message : prompt() is not supported. 
thse new older and file should create new file and folder in the given directory. But open folder and open file should open a file dialog.