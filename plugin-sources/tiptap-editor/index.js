// Tiptap Editor Plugin - VS Code-style secure architecture
// No eval(), no new Function(), returns HTML for sandboxed iframe

function activate(context, api) {
  // Register renderer for 'text' note type
  const disposable = api.registerNoteRenderer("text", {
    render: (note) => {
      // This function runs in the main process (Node.js)
      // Returns JavaScript code that will run in sandboxed iframe

      // Note: In a real implementation, you'd want to include Tiptap libraries
      // For this POC, we'll use a simple contenteditable div

      return `
        const root = document.getElementById('plugin-root');
        
        // Create simple rich text editor
        root.innerHTML = \`
          <div style="border: 1px solid #e5e7eb; border-radius: 0.5rem; overflow: hidden;">
            <div id="toolbar" style="background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 0.5rem; display: flex; gap: 0.25rem; flex-wrap: wrap;">
              <button data-cmd="bold" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">Bold</button>
              <button data-cmd="italic" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">Italic</button>
              <button data-cmd="underline" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">Underline</button>
              <div style="width: 1px; height: 1.5rem; background: #d1d5db; margin: 0 0.25rem;"></div>
              <button data-cmd="formatBlock" data-value="h1" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">H1</button>
              <button data-cmd="formatBlock" data-value="h2" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">H2</button>
              <button data-cmd="formatBlock" data-value="h3" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">H3</button>
              <button data-cmd="formatBlock" data-value="p" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">Normal</button>
              <div style="width: 1px; height: 1.5rem; background: #d1d5db; margin: 0 0.25rem;"></div>
              <button data-cmd="insertUnorderedList" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">• List</button>
              <button data-cmd="insertOrderedList" style="padding: 0.375rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.875rem; font-weight: 500;">1. List</button>
            </div>
            <div id="editor" contenteditable="true" style="padding: 1.5rem; min-height: 400px; outline: none; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.75;">${note.content.replace(/\n/g, "<br>")}</div>
          </div>
        \`;
        
        const editor = document.getElementById('editor');
        const toolbar = document.getElementById('toolbar');
        
        // Handle toolbar buttons
        toolbar.addEventListener('click', (e) => {
          const button = e.target.closest('button');
          if (!button) return;
          
          const cmd = button.dataset.cmd;
          const value = button.dataset.value;
          
          editor.focus();
          document.execCommand(cmd, false, value || null);
        });
        
        // Listen for note updates
        Nodex.onMessage = (message) => {
          if (message.type === 'update' || message.type === 'render') {
            const note = message.payload;
            editor.innerHTML = note.content.replace(/\\n/g, '<br>');
          }
        };
        
        // Optional: Send content changes back to parent
        editor.addEventListener('input', () => {
          Nodex.postMessage({
            type: 'contentChanged',
            content: editor.innerHTML
          });
        });
      `;
    },
  });

  context.subscriptions.push(disposable);
  console.log("[Plugin: tiptap-editor] Activated (secure mode)");
}

function deactivate() {
  console.log("[Plugin: tiptap-editor] Deactivated");
}

module.exports = { activate, deactivate };
