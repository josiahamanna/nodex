// Monaco Editor Plugin - VS Code-style secure architecture
// No eval(), no new Function(), returns HTML for sandboxed iframe

function activate(context, api) {
  // Register renderer for 'code' note type
  const disposable = api.registerNoteRenderer('code', {
    render: (note) => {
      // This function runs in the main process (Node.js)
      // Returns JavaScript code that will run in sandboxed iframe
      
      // For this POC, we'll use a simple code editor with syntax highlighting
      // In a real implementation, you'd load Monaco Editor library
      
      return `
        const root = document.getElementById('plugin-root');
        
        // Create simple code editor
        root.innerHTML = \`
          <div style="display: flex; flex-direction: column; height: 100%; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;">
            <div style="background: #1e1e1e; color: #d4d4d4; padding: 0.5rem 1rem; border-bottom: 1px solid #333; font-size: 0.875rem;">
              Code Editor
            </div>
            <textarea id="code-editor" style="flex: 1; background: #1e1e1e; color: #d4d4d4; border: none; padding: 1rem; font-family: inherit; font-size: 0.875rem; line-height: 1.5; resize: none; outline: none; tab-size: 2;">${note.content}</textarea>
          </div>
        \`;
        
        const editor = document.getElementById('code-editor');
        
        // Handle tab key
        editor.addEventListener('keydown', (e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 2;
          }
        });
        
        // Listen for note updates
        modux.onMessage = (message) => {
          if (message.type === 'update' || message.type === 'render') {
            const note = message.payload;
            editor.value = note.content;
          }
        };
        
        // Optional: Send content changes back to parent
        editor.addEventListener('input', () => {
          modux.postMessage({
            type: 'contentChanged',
            content: editor.value
          });
        });
      `;
    }
  });
  
  context.subscriptions.push(disposable);
  console.log('[Plugin: monaco-editor] Activated (secure mode)');
}

function deactivate() {
  console.log('[Plugin: monaco-editor] Deactivated');
}

module.exports = { activate, deactivate };
