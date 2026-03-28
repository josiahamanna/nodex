# Markdown Renderer - Reference Implementation

This is a **reference implementation** demonstrating the new Modux plugin architecture.

## Features

- ✅ **No hardcoded UI strings** - All UI defined in `index.html`
- ✅ **Separate file structure** - Backend (`main.js`), Frontend (`index.js`), UI (`index.html`)
- ✅ **State persistence** - Remembers cursor position, scroll, and preview mode per-note
- ✅ **Secure communication** - Messages routed through plugin loader bridge
- ✅ **Rich editor** - Toolbar, keyboard shortcuts, live preview
- ✅ **Auto-save** - Debounced auto-save with visual feedback
- ✅ **Statistics** - Word count, character count, line count

## File Structure

```
markdown-renderer-reference/
├── manifest.json       # Plugin metadata
├── main.js            # Backend logic (Node.js)
├── index.html         # UI structure
├── index.js           # Frontend logic (browser)
├── style.css          # Styles
└── README.md          # This file
```

## Architecture Highlights

### Backend (main.js)

- Runs in sandboxed worker thread
- Handles markdown rendering
- Manages database operations
- Listens for note events
- No hardcoded UI!

### Frontend (index.js)

- Runs in sandboxed iframe
- Handles user interaction
- Manages per-note state
- Communicates via `modux` API
- Auto-saves content

### State Persistence

The plugin saves state per-note:

```javascript
{
  noteId: 'note-123',
  content: '# Hello',
  cursorPosition: 7,
  scrollPosition: 0,
  isPreviewMode: false,
  isDirty: false
}
```

When you switch back to a note, the exact state is restored.

## Keyboard Shortcuts

- `Ctrl/Cmd + B` - Bold
- `Ctrl/Cmd + I` - Italic
- `Ctrl/Cmd + \`` - Code
- `Ctrl/Cmd + K` - Link
- `Ctrl/Cmd + P` - Toggle Preview
- `Tab` - Insert 2 spaces

## Communication Flow

```
User types in editor
  ↓
Frontend (index.js) detects input
  ↓
Sends 'contentChanged' message to parent
  ↓
Plugin Loader routes to backend
  ↓
Backend (main.js) saves to database
  ↓
Response sent back to frontend
  ↓
UI updated with save status
```

## Security

- ✅ Runs in sandboxed iframe (CSP enforced)
- ✅ Backend in isolated worker thread
- ✅ No direct DOM access to parent
- ✅ All communication via structured messages
- ✅ Permission-based API access

## Usage

1. Install plugin to `plugins/` directory
2. Open a markdown note
3. Plugin automatically activates
4. Start typing!

## Development

To modify this plugin:

1. Edit files in this directory
2. Enable development mode in Modux
3. Changes auto-reload on save
4. Check DevTools for debugging

## License

MIT
