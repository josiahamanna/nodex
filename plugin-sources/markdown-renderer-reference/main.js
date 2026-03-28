/**
 * Markdown Renderer Plugin - Reference Implementation
 * 
 * This is a reference implementation demonstrating the new plugin architecture:
 * - No hardcoded UI strings
 * - Separate HTML file for UI
 * - Backend logic in main.js
 * - Frontend logic in index.js
 * - State persistence (per-note and global)
 * - Secure communication via plugin loader bridge
 */

function activate(context, api) {
  context.logger.info('Markdown Renderer plugin activating...');
  
  // Register note renderer
  const disposable = api.registerNoteRenderer('markdown', {
    // Path to HTML file (no hardcoded UI strings!)
    htmlFile: 'index.html',
    
    // Optional: preprocess note data before sending to UI
    preprocess: async (note) => {
      // Add metadata
      const wordCount = note.content.split(/\s+/).filter(w => w.length > 0).length;
      const charCount = note.content.length;
      const lineCount = note.content.split('\n').length;
      
      return {
        ...note,
        metadata: {
          ...note.metadata,
          wordCount,
          charCount,
          lineCount,
          processedAt: Date.now()
        }
      };
    },
    
    // Handle messages from frontend
    onMessage: async (noteId, message) => {
      context.logger.debug('Received message from frontend:', message);
      
      switch (message.action) {
        case 'renderMarkdown':
          return await renderMarkdown(message.payload.content);
          
        case 'saveContent':
          return await saveContent(api, noteId, message.payload.content);
          
        case 'getStats':
          return await getStats(api, noteId);
          
        default:
          context.logger.warn('Unknown action:', message.action);
          return { error: 'Unknown action' };
      }
    }
  });
  
  // Add to subscriptions for cleanup
  context.subscriptions.push(disposable);
  
  // Listen for note events
  const noteListener = api.events.on('note:saved', async (note) => {
    if (note.type === 'markdown') {
      context.logger.info(`Markdown note saved: ${note.id}`);
      
      // Update statistics in plugin storage
      const stats = {
        lastSaved: Date.now(),
        saveCount: (await api.storage.getForNote(note.id, 'saveCount') || 0) + 1
      };
      
      await api.storage.setForNote(note.id, 'stats', stats);
    }
  });
  
  context.subscriptions.push(noteListener);
  
  context.logger.info('Markdown Renderer plugin activated successfully');
}

/**
 * Render markdown to HTML
 */
async function renderMarkdown(content) {
  // Simple markdown to HTML conversion
  // In production, you'd use a proper markdown library
  const html = content
    // Headers
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/gim, '<code>$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
    // Line breaks
    .replace(/\n\n/gim, '</p><p>')
    .replace(/\n/gim, '<br>');
  
  return {
    html: `<p>${html}</p>`,
    success: true
  };
}

/**
 * Save content to database
 */
async function saveContent(api, noteId, content) {
  try {
    await api.db.update('notes', noteId, {
      content,
      updated_at: Date.now()
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get note statistics
 */
async function getStats(api, noteId) {
  const stats = await api.storage.getForNote(noteId, 'stats');
  return stats || { lastSaved: null, saveCount: 0 };
}

/**
 * Plugin deactivation
 */
function deactivate() {
  // Cleanup is handled automatically via context.subscriptions
}

module.exports = { activate, deactivate };
