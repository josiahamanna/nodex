#  Plugin architecture and requirements.

## Requirements

- Plugins should not have hardcoded renderer string.
- For now UI should be built using html in a separate file. (index.js)
- node logic should be put in main.js
- frontend logic can be put in any file, preferably index.js which is reffered in index.html.
- The state of the plugin should persist when the tabs are switched from one note to antoher.

## Clarification

1. State Persistence Scope
    - Should state persist per-note (each note remembers its own state)? Or per-plugin globally?
        - Both depends on the use case. But what do you suggest?
    - What state should persist? (cursor position, scroll, editor state, etc
        - Yes
2. HTML File Loading
    - Should the system load index.html from the plugin directory?
        - Yes, by reading the manifest file.
    - Or should plugins provide HTML as a template that gets injected?
        - Not sure
    - Security concern: Loading external HTML requires careful CSP handling
        - Yes
3. File Structure Enforcement
    - Should the system require this structure, or just recommend it?
    - What happens if a plugin doesn't follow the structure?
        - Should fail with a warning. System should not crash.
4. Backend Logic Scope
    - What Node.js capabilities should main.js have access to?
        - All execpt those with security concerns should be abstracted behind API modus.*
    - File system? Database? Network?
        - File sytem (carefull exposure)
        - Database - only to its data.
        - Network (again careful exposure)
    - Should it be sandboxed in a worker thread?
        - Yes
5.Communication Pattern
    - How should main.js (backend) communicate with index.js (frontend)?
        - Not sure. Follow the best practices from my inpirations like vscode and trillum. Do what is secure.
    - Through the plugin loader as a bridge?
        - Not sure. Follow the best practices from my inpirations like vscode and trillum. Do what is secure.
    - Direct IPC channels?
        - Not sure. Follow the best practices from my inpirations like vscode and trillum. Do what is secure.
