// Markdown Note Plugin - VS Code-style secure architecture
// No eval(), no new Function(), returns HTML for sandboxed iframe

function activate(context, api) {
  // Register renderer for 'markdown' note type
  const disposable = api.registerNoteRenderer('markdown', {
    render: (note) => {
      // This function runs in the main process (Node.js)
      // Returns HTML string that will be rendered in sandboxed iframe
      
      const text = note.content;
      
      function renderMarkdown(text) {
        return text
          .replace(/^### (.*$)/gim, '<h3 style="font-size: 1.25rem; font-weight: bold; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1f2937;">$1</h3>')
          .replace(/^## (.*$)/gim, '<h2 style="font-size: 1.5rem; font-weight: bold; margin-top: 2rem; margin-bottom: 1rem; color: #1f2937;">$1</h2>')
          .replace(/^# (.*$)/gim, '<h1 style="font-size: 2rem; font-weight: bold; margin-top: 2.5rem; margin-bottom: 1.25rem; color: #111827;">$1</h1>')
          .replace(/\*\*(.*?)\*\*/gim, '<strong style="font-weight: 700; color: #374151;">$1</strong>')
          .replace(/\*(.*?)\*/gim, '<em style="font-style: italic;">$1</em>')
          .replace(/^- (.*$)/gim, '<li style="margin-left: 1.5rem; margin-bottom: 0.5rem; list-style-type: disc;">$1</li>')
          .replace(/\n\n/gim, '</p><p style="margin-bottom: 1rem; line-height: 1.75; color: #374151;">')
          .replace(/\n/gim, '<br>');
      }
      
      const html = '<div style="color: #1f2937; line-height: 1.75; padding: 1rem;">' + renderMarkdown(text) + '</div>';
      
      // Return JavaScript code that will run in the sandboxed iframe
      return `
        const root = document.getElementById('plugin-root');
        root.innerHTML = ${JSON.stringify(html)};
        
        // Listen for note updates
        modux.onMessage = (message) => {
          if (message.type === 'update' || message.type === 'render') {
            const note = message.payload;
            const text = note.content;
            
            function renderMarkdown(text) {
              return text
                .replace(/^### (.*$)/gim, '<h3 style="font-size: 1.25rem; font-weight: bold; margin-top: 1.5rem; margin-bottom: 0.75rem; color: #1f2937;">$1</h3>')
                .replace(/^## (.*$)/gim, '<h2 style="font-size: 1.5rem; font-weight: bold; margin-top: 2rem; margin-bottom: 1rem; color: #1f2937;">$1</h2>')
                .replace(/^# (.*$)/gim, '<h1 style="font-size: 2rem; font-weight: bold; margin-top: 2.5rem; margin-bottom: 1.25rem; color: #111827;">$1</h1>')
                .replace(/\\*\\*(.*?)\\*\\*/gim, '<strong style="font-weight: 700; color: #374151;">$1</strong>')
                .replace(/\\*(.*?)\\*/gim, '<em style="font-style: italic;">$1</em>')
                .replace(/^- (.*$)/gim, '<li style="margin-left: 1.5rem; margin-bottom: 0.5rem; list-style-type: disc;">$1</li>')
                .replace(/\\n\\n/gim, '</p><p style="margin-bottom: 1rem; line-height: 1.75; color: #374151;">')
                .replace(/\\n/gim, '<br>');
            }
            
            const html = '<div style="color: #1f2937; line-height: 1.75; padding: 1rem;">' + renderMarkdown(text) + '</div>';
            root.innerHTML = html;
          }
        };
      `;
    }
  });
  
  context.subscriptions.push(disposable);
  console.log('[Plugin: markdown-note] Activated (secure mode)');
}

function deactivate() {
  console.log('[Plugin: markdown-note] Deactivated');
}

module.exports = { activate, deactivate };
