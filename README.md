# Nodex - Programmable Knowledge System POC

A production-grade proof of concept for a plugin-driven, programmable knowledge system built with Electron, React, and TypeScript.

## Overview

Nodex demonstrates how to build a secure, extensible Electron application with a plugin architecture that allows dynamic note type registration without modifying core code.

## Features

- ✅ **Plugin Architecture** - Dynamic plugin loading and registration
- ✅ **Multiple Note Types** - Markdown, Rich Text (Tiptap), Code (Monaco)
- ✅ **Production Security** - IPC validation, DOMPurify, strict CSP
- ✅ **Type Safety** - Full TypeScript implementation
- ✅ **Modern UI** - React, Redux, TailwindCSS
- ✅ **Hot Module Replacement** - Fast development with webpack-dev-server

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                          │
├─────────────────────────────────────────────────────────┤
│  Main Process                                            │
│  ├── Plugin Loader (reads plugin files)                 │
│  ├── Component Registry (stores plugin components)      │
│  ├── IPC Handlers (validated communication)             │
│  └── Security Layer (input validation)                  │
├─────────────────────────────────────────────────────────┤
│  Preload Script                                          │
│  └── Context Bridge (secure IPC exposure)               │
├─────────────────────────────────────────────────────────┤
│  Renderer Process                                        │
│  ├── React App (UI)                                      │
│  ├── Redux Store (state management)                     │
│  ├── Note Renderers (Markdown, Text, Code, Plugin)      │
│  └── DOMPurify (HTML sanitization)                      │
└─────────────────────────────────────────────────────────┘
```

## Project Structure

```
poc-electron-plugin-arch/
├── src/
│   ├── main.ts                 # Electron main process
│   ├── preload.ts              # Secure IPC bridge
│   ├── core/
│   │   ├── plugin-loader.ts    # Plugin loading logic
│   │   └── registry.ts         # Component registry
│   ├── shared/
│   │   ├── ipc-channels.ts     # IPC constants
│   │   └── validators.ts       # Input validation
│   ├── renderer/
│   │   ├── index.tsx           # React entry point
│   │   ├── App.tsx             # Main app component
│   │   ├── store/              # Redux store
│   │   └── components/         # React components
│   └── types/
│       └── window.d.ts         # Global type definitions
├── plugins/
│   └── markdown-note/          # Example plugin
│       ├── manifest.json       # Plugin metadata
│       └── index.js            # Plugin implementation
├── SECURITY.md                 # Security documentation
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run package
```

### Development

The app runs with hot module replacement enabled. Edit files and see changes instantly.

**Development URL:** http://localhost:9001

## Creating Plugins

### Plugin Structure

```
plugins/your-plugin/
├── manifest.json
└── index.js
```

### Manifest Example

```json
{
  "name": "your-plugin",
  "version": "1.0.0",
  "main": "index.js",
  "description": "Your plugin description"
}
```

### Plugin Implementation

```javascript
function activate(Nodex) {
  Nodex.ui.registerComponent('your-type', `
    const text = note.content;
    
    // Your rendering logic here
    const html = '<div>' + text + '</div>';
    
    return html;
  `);
  
  console.log('[Plugin: your-plugin] Activated');
}

function deactivate() {
  console.log('[Plugin: your-plugin] Deactivated');
}

module.exports = { activate, deactivate };
```

### Plugin API

**Available in `Nodex` object:**

- `Nodex.ui.registerComponent(type, componentCode)` - Register a note renderer

**Component Code Requirements:**

- Must be a string containing JavaScript code
- Must return HTML string
- Has access to `note` object with properties: `id`, `type`, `title`, `content`, `metadata`
- Output is sanitized with DOMPurify

### Security Constraints

Plugins are validated for:
- Maximum size (100KB)
- No `eval()` or `Function()` constructor
- HTML output is sanitized before rendering
- Only allowed HTML tags and attributes

## Security

This POC follows production-grade security best practices:

### Implemented Security Measures

1. **Process Isolation**
   - Context isolation enabled
   - Node integration disabled
   - Secure IPC with contextBridge

2. **Input Validation**
   - All IPC payloads validated
   - Type guards for note IDs and types
   - Plugin code validation

3. **XSS Prevention**
   - DOMPurify sanitization
   - Strict HTML tag allowlist
   - Content Security Policy

4. **Type Safety**
   - Full TypeScript coverage
   - Strict IPC channel constants
   - Validated interfaces

See [SECURITY.md](./SECURITY.md) for complete security documentation.

## Technology Stack

### Core
- **Electron** - Cross-platform desktop framework
- **TypeScript** - Type-safe JavaScript
- **Webpack** - Module bundler

### Frontend
- **React** - UI library
- **Redux Toolkit** - State management
- **TailwindCSS** - Utility-first CSS

### Editors
- **Tiptap** - Rich text editor
- **Monaco Editor** - Code editor

### Security
- **DOMPurify** - HTML sanitization
- **CSP** - Content Security Policy

## Scripts

```bash
# Development
npm start              # Start dev server with HMR

# Production
npm run package        # Package app for distribution
npm run make           # Create installers

# Code Quality
npm run lint           # Run ESLint
```

## Configuration Files

- `forge.config.js` - Electron Forge configuration
- `webpack.main.config.js` - Main process webpack config
- `webpack.renderer.config.js` - Renderer process webpack config
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.js` - TailwindCSS configuration

## Known Limitations

### Development
- CSP requires `unsafe-eval` for webpack-dev-server HMR
- Sandbox disabled on Linux for compatibility

### Production Recommendations
- Enable sandbox on macOS/Windows
- Use production CSP without `unsafe-eval`
- Implement plugin signing
- Add plugin permissions system

## Roadmap

- [ ] Hot reload for plugins (file watcher)
- [ ] Plugin marketplace
- [ ] SQLite database integration
- [ ] Note CRUD operations
- [ ] Tree structure for notes
- [ ] Graph view
- [ ] Sync engine
- [ ] Plugin sandboxing with VM2
- [ ] Code signing
- [ ] Auto-updates

## Testing

### Manual Testing

1. **Plugin Loading**: Check console for plugin registration
2. **Note Rendering**: Switch between different note types
3. **Security**: Try injecting malicious HTML
4. **Validation**: Send invalid IPC payloads

### Automated Testing (TODO)

- Unit tests for validators
- Integration tests for IPC
- E2E tests with Playwright

## Troubleshooting

### Port Already in Use

If port 3001 is in use, modify `forge.config.js`:

```javascript
port: 3002, // Change to available port
```

### Sandbox Error on Linux

The app automatically disables sandbox on Linux. For production, configure proper sandbox permissions.

### CSP Violations

Development CSP allows `unsafe-eval` for HMR. Production should use strict CSP from `index.production.html`.

## Contributing

This is a POC for demonstration purposes. For production use:

1. Review and update security measures
2. Add comprehensive testing
3. Implement error handling
4. Add logging and monitoring
5. Configure auto-updates

## License

ISC

## Acknowledgments

Built following Electron security best practices and modern web development patterns.
