# Nodex Plugin Architecture Implementation - Epic Plan

This plan bridges the gap between the current POC implementation and the new production-ready plugin architecture, broken into incremental phases with core features prioritized first.

## Current State Analysis

### ✅ What We Have
- Basic plugin loading from filesystem
- Plugin registry for component registration
- Sandboxed iframe rendering with postMessage
- Plugin import/export via ZIP files
- Simple manifest.json validation
- IPC communication between main and renderer
- React, Redux, TailwindCSS foundation
- DOMPurify sanitization
- Basic plugin manager UI

### ❌ What's Missing (vs New Architecture)
- **JSX Support**: Plugins use string-based React.createElement, no JSX compilation
- **React Bridge Pattern**: No shared React instance, plugins bundle their own
- **Plugin IDE**: No built-in development environment
- **Dependency Management**: No npm package support or bundling
- **Distribution Modes**: No dev vs production package distinction
- **Backend Isolation**: Backend runs in main process, not child processes
- **State Persistence**: No per-note or global state APIs
- **Network Access**: No HTTP request capabilities with progressive trust
- **Database Access**: No plugin-specific database tables
- **File System Access**: No sandboxed file operations
- **Advanced Security**: No permission system, rate limiting, or validation
- **Hot Reload**: No live preview during development

---

## Epic 1: Foundation & Core Plugin System

**Priority**: P0 (Critical)  
**Estimated Duration**: 3-4 weeks  
**Dependencies**: None

### Goals
Establish the foundational architecture for the new plugin system with proper file structure, JSX support, and basic security.

### User Stories

#### 1.1 Plugin File Structure Update
**As a** plugin developer  
**I want** to use separate `.jsx` and `.js` files with configurable entry points  
**So that** I can write cleaner, more maintainable plugin code

**Acceptance Criteria**:
- [ ] Update manifest schema to support `mode`, `main`, `ui`, `html` fields
- [ ] Support `.jsx` files for frontend code
- [ ] Support custom backend filenames (not just `main.js`)
- [ ] Auto-detect plugin type based on files present
- [ ] Validate file structure on plugin load
- [ ] Update existing plugins to new structure

**Technical Tasks**:
- Update `PluginManifest` interface in `plugin-loader.ts`
- Add file structure validation logic
- Update plugin-sources examples to new format
- Create migration guide for existing plugins

#### 1.2 JSX Compilation Pipeline
**As a** plugin developer  
**I want** to write JSX code instead of React.createElement  
**So that** my plugin code is more readable and maintainable

**Acceptance Criteria**:
- [ ] Integrate Babel standalone for JSX compilation
- [ ] Compile `.jsx` files to `.js` on plugin load (dev mode)
- [ ] Cache compiled output to avoid recompilation
- [ ] Show compilation errors in plugin manager
- [ ] Support JSX syntax in plugin preview

**Technical Tasks**:
- Install `@babel/standalone` dependency
- Create JSX compiler service in main process
- Add compilation step to plugin loader
- Implement error handling and reporting
- Add compilation progress indicators

#### 1.3 React Bridge Pattern
**As a** plugin developer  
**I want** to use the main app's React instance  
**So that** my plugins are smaller and avoid version conflicts

**Acceptance Criteria**:
- [ ] Inject React bridge API into plugin iframes
- [ ] Expose `window.Nodex.React` with core hooks (useState, useEffect, etc.)
- [ ] Expose `window.Nodex.ReactDOM` for rendering
- [ ] Support message-based React operations
- [ ] Maintain strict CSP compliance
- [ ] Provide TypeScript definitions for plugin API

**Technical Tasks**:
- Create React bridge generator in renderer process
- Implement message-based React API shim
- Update `SecurePluginRenderer.tsx` to inject bridge
- Create `plugin-api.d.ts` with full type definitions
- Test with existing plugins

#### 1.4 Enhanced Manifest Validation
**As a** system administrator  
**I want** strict manifest validation with clear error messages  
**So that** invalid plugins fail gracefully without crashing the app

**Acceptance Criteria**:
- [ ] Validate all required fields (name, version, mode, main)
- [ ] Validate optional fields with proper types
- [ ] Check for conflicting field combinations (html + rootId)
- [ ] Validate permission declarations
- [ ] Provide detailed error messages
- [ ] Log validation failures

**Technical Tasks**:
- Create `manifest-validator.ts` service
- Implement JSON schema validation
- Add validation to plugin loader
- Create error reporting UI
- Update documentation with manifest spec

---

## Epic 2: Plugin Distribution & Packaging

**Priority**: P0 (Critical)  
**Estimated Duration**: 2-3 weeks  
**Dependencies**: Epic 1

### Goals
Implement dual-mode plugin distribution (development vs production) with proper packaging and bundling.

### User Stories

#### 2.1 Development Mode Packages
**As a** plugin developer  
**I want** to export source code packages for sharing with other developers  
**So that** they can modify and learn from my plugin

**Acceptance Criteria**:
- [ ] Support `.Nodexplugin-dev` file extension
- [ ] Package includes source files (.jsx, .js)
- [ ] Include package.json with dependencies
- [ ] Exclude node_modules from package
- [ ] Set manifest mode to "development"
- [ ] Validate dev package structure on import

**Technical Tasks**:
- Update ZIP handler to support dev mode
- Create dev package exporter in plugin manager
- Add package.json generation
- Update import logic to detect mode
- Add UI for export mode selection

#### 2.2 Production Mode Packages
**As a** plugin user  
**I want** to install pre-compiled, optimized plugins  
**So that** they load instantly without compilation

**Acceptance Criteria**:
- [ ] Support `.Nodexplugin` file extension
- [ ] Package includes compiled bundles (.bundle.js)
- [ ] All dependencies bundled in output
- [ ] Minified and optimized code
- [ ] Set manifest mode to "production"
- [ ] Fast loading with no compilation step

**Technical Tasks**:
- Integrate Rollup for frontend bundling
- Integrate esbuild for backend bundling
- Create production bundler service
- Implement minification and optimization
- Add bundling progress indicators
- Update plugin loader to handle bundles

#### 2.3 Plugin Bundler Integration
**As a** plugin developer  
**I want** automatic bundling of my plugin with dependencies  
**So that** I don't need external build tools

**Acceptance Criteria**:
- [ ] Bundle frontend code with Rollup
- [ ] Bundle backend code with esbuild
- [ ] Include npm dependencies in bundle
- [ ] Exclude Nodex's React from bundle
- [ ] Handle worker files separately
- [ ] Generate source maps for debugging

**Technical Tasks**:
- Install rollup and esbuild dependencies
- Create bundler configuration
- Implement frontend bundling pipeline
- Implement backend bundling pipeline
- Add worker file handling
- Test with complex dependencies (pdfjs, monaco)

---

## Epic 3: Dependency Management System

**Priority**: P1 (High)  
**Estimated Duration**: 3-4 weeks  
**Dependencies**: Epic 1, Epic 2

### Goals
Implement comprehensive dependency management with isolated caches, user control, and security validation.

### User Stories

#### 3.1 Isolated Plugin Cache
**As a** system  
**I want** each plugin to have its own dependency cache  
**So that** version conflicts are impossible and cleanup is easy

**Acceptance Criteria**:
- [ ] Create `~/.nodex/plugin-cache/` directory structure
- [ ] Isolate dependencies per plugin
- [ ] Support npm install to cache directory
- [ ] Track cache size and usage
- [ ] Provide cache cleanup utilities

**Technical Tasks**:
- Create cache manager service
- Implement isolated npm install
- Add cache directory initialization
- Create cache cleanup logic
- Add cache size tracking

#### 3.2 Manual Dependency Installation
**As a** plugin developer  
**I want** to approve dependency installations  
**So that** I have control over what gets installed

**Acceptance Criteria**:
- [ ] Detect dependencies in package.json
- [ ] Show installation dialog with package list
- [ ] Display package sizes and descriptions
- [ ] Allow user to approve/cancel
- [ ] Show installation progress
- [ ] Remember user preference (auto-fetch toggle)

**Technical Tasks**:
- Create dependency detector
- Build installation dialog UI
- Implement npm install wrapper
- Add progress tracking
- Store user preferences
- Handle installation errors

#### 3.3 Dependency Update Flow
**As a** plugin developer  
**I want** to be notified when dependencies change  
**So that** I can review and approve updates

**Acceptance Criteria**:
- [ ] Detect package.json changes
- [ ] Show diff of dependency changes (added, removed, updated)
- [ ] Warn about major version updates
- [ ] Allow user to approve/cancel updates
- [ ] Support auto-sync mode (optional)
- [ ] Recompile plugin after updates

**Technical Tasks**:
- Implement file watcher for package.json
- Create dependency diff calculator
- Build update dialog UI
- Add version comparison logic
- Implement auto-sync setting
- Trigger recompilation on update

#### 3.4 Dependency Management UI
**As a** plugin developer  
**I want** a visual interface to manage dependencies  
**So that** I can easily add, update, or remove packages

**Acceptance Criteria**:
- [ ] Show list of installed dependencies
- [ ] Display dependency versions and sizes
- [ ] Search npm registry for packages
- [ ] Add dependencies via UI
- [ ] Update individual dependencies
- [ ] Remove dependencies
- [ ] View cache location and size

**Technical Tasks**:
- Create dependency panel component
- Implement npm search integration
- Build add dependency dialog
- Add update/remove actions
- Display cache information
- Integrate with plugin manager

#### 3.5 Security & Validation
**As a** system administrator  
**I want** dependencies validated before installation  
**So that** malicious packages are blocked

**Acceptance Criteria**:
- [ ] Check packages against malicious DB
- [ ] Verify package exists on npm
- [ ] Warn about large packages (>50MB)
- [ ] Run npm install with --no-scripts
- [ ] Log all dependency installations
- [ ] Provide security audit reports

**Technical Tasks**:
- Integrate malicious package checker
- Implement npm registry validation
- Add package size warnings
- Configure secure npm install
- Create installation audit log
- Build security report UI

---

## Epic 4: Built-in Plugin IDE

**Priority**: P1 (High)  
**Estimated Duration**: 4-5 weeks  
**Dependencies**: Epic 1, Epic 2, Epic 3

### Goals
Create a full-featured plugin development environment inside Nodex with Monaco editor, live preview, and debugging tools.

### User Stories

#### 4.1 Monaco Editor Integration
**As a** plugin developer  
**I want** a code editor with syntax highlighting and IntelliSense  
**So that** I can write plugins efficiently

**Acceptance Criteria**:
- [ ] Integrate Monaco editor for code editing
- [ ] Support JavaScript and JSX syntax highlighting
- [ ] Provide IntelliSense for Nodex API
- [ ] Support multiple file editing (tabs)
- [ ] Auto-save changes
- [ ] Keyboard shortcuts (Ctrl+S, etc.)

**Technical Tasks**:
- Set up Monaco editor component
- Configure JSX language support
- Create TypeScript definitions for IntelliSense
- Implement multi-file editor
- Add auto-save functionality
- Configure keyboard shortcuts

#### 4.2 Live Preview with Hot Reload
**As a** plugin developer  
**I want** to see changes instantly in a preview pane  
**So that** I can iterate quickly

**Acceptance Criteria**:
- [ ] Split view: editor + preview
- [ ] Auto-compile on file save
- [ ] Reload preview automatically
- [ ] Show compilation errors inline
- [ ] Preserve preview state when possible
- [ ] Toggle preview on/off

**Technical Tasks**:
- Create split-pane layout
- Implement file watcher
- Add auto-compilation trigger
- Build preview iframe component
- Display compilation errors
- Add preview controls

#### 4.3 Plugin Project Management
**As a** plugin developer  
**I want** to create, open, and manage plugin projects  
**So that** I can organize my work

**Acceptance Criteria**:
- [ ] Create new plugin from template
- [ ] Open existing plugin projects
- [ ] Save plugin projects
- [ ] Export as dev or production package
- [ ] Delete plugin projects
- [ ] List all plugin projects

**Technical Tasks**:
- Create plugin templates
- Build project creation wizard
- Implement project file management
- Add export functionality
- Create project list UI
- Handle project deletion

#### 4.4 Debugging Tools
**As a** plugin developer  
**I want** debugging tools to troubleshoot issues  
**So that** I can fix bugs efficiently

**Acceptance Criteria**:
- [ ] Console output from plugin
- [ ] Error stack traces
- [ ] Network request monitor
- [ ] State inspector (React DevTools-like)
- [ ] Performance metrics
- [ ] Breakpoint support (future)

**Technical Tasks**:
- Capture console logs from iframe
- Display error stack traces
- Create network monitor
- Build state inspector
- Add performance tracking
- Plan breakpoint integration

#### 4.5 Plugin Templates & Scaffolding
**As a** plugin developer  
**I want** pre-built templates for common plugin types  
**So that** I can start quickly

**Acceptance Criteria**:
- [ ] Template: Basic note renderer
- [ ] Template: Rich text editor
- [ ] Template: Code editor
- [ ] Template: API caller (with network access)
- [ ] Template: Database plugin
- [ ] Customizable template variables

**Technical Tasks**:
- Create template files
- Build template selection UI
- Implement variable substitution
- Add template documentation
- Test each template
- Create template gallery

---

## Epic 5: Backend Isolation & Child Processes

**Priority**: P2 (Medium)  
**Estimated Duration**: 2-3 weeks  
**Dependencies**: Epic 1

### Goals
Move plugin backend execution from main process to isolated child processes for security and stability.

### User Stories

#### 5.1 Child Process Plugin Execution
**As a** system  
**I want** plugin backends to run in separate processes  
**So that** crashes don't affect the main app

**Acceptance Criteria**:
- [ ] Spawn child process for each plugin backend
- [ ] Communicate via IPC (not direct require)
- [ ] Handle process crashes gracefully
- [ ] Restart crashed plugins automatically
- [ ] Monitor process health
- [ ] Clean up processes on plugin unload

**Technical Tasks**:
- Create child process manager
- Implement IPC communication protocol
- Add crash detection and recovery
- Build process health monitor
- Implement cleanup logic
- Test with multiple plugins

#### 5.2 Backend API Implementation
**As a** plugin developer  
**I want** a comprehensive backend API  
**So that** I can access system resources securely

**Acceptance Criteria**:
- [ ] Database access API (plugin tables)
- [ ] File system API (sandboxed)
- [ ] HTTP request API (with permissions)
- [ ] Storage API (key-value)
- [ ] Event system API
- [ ] Logger API

**Technical Tasks**:
- Implement database access layer
- Create sandboxed file system API
- Build HTTP request handler
- Implement storage service
- Create event bus
- Add logging service

#### 5.3 Permission System
**As a** system administrator  
**I want** plugins to declare required permissions  
**So that** I can control what they can access

**Acceptance Criteria**:
- [ ] Define permission types (storage, db, fs, network, etc.)
- [ ] Validate permissions in manifest
- [ ] Enforce permissions at runtime
- [ ] Show permission requests to user
- [ ] Allow user to approve/deny
- [ ] Revoke permissions

**Technical Tasks**:
- Define permission schema
- Implement permission validator
- Create permission enforcement layer
- Build permission request UI
- Add permission management
- Test permission boundaries

---

## Epic 6: State Persistence & Database

**Priority**: P2 (Medium)  
**Estimated Duration**: 2-3 weeks  
**Dependencies**: Epic 5

### Goals
Implement per-note and global state persistence with database access for plugins.

### User Stories

#### 6.1 Plugin Storage API
**As a** plugin developer  
**I want** to persist plugin-specific data  
**So that** my plugin state survives app restarts

**Acceptance Criteria**:
- [ ] Global storage (plugin-wide key-value)
- [ ] Per-note storage (note-specific key-value)
- [ ] Async get/set/delete operations
- [ ] List all keys
- [ ] Clear all storage
- [ ] Storage size limits

**Technical Tasks**:
- Implement storage backend (SQLite or JSON)
- Create storage API service
- Add per-note storage isolation
- Implement size limits
- Add storage cleanup
- Test with multiple plugins

#### 6.2 Database Access Layer
**As a** plugin developer  
**I want** to query and store data in the database  
**So that** I can build data-driven plugins

**Acceptance Criteria**:
- [ ] Create plugin-specific tables (prefix-based)
- [ ] Read-only access to notes table
- [ ] Execute SQL queries (validated)
- [ ] Insert/update/delete in plugin tables
- [ ] Transaction support
- [ ] Query result pagination

**Technical Tasks**:
- Set up SQLite database
- Implement table prefix isolation
- Create query validator
- Build database API
- Add transaction support
- Implement pagination

#### 6.3 State Synchronization
**As a** plugin developer  
**I want** state changes to sync between backend and frontend  
**So that** my UI stays up-to-date

**Acceptance Criteria**:
- [ ] Notify frontend of state changes
- [ ] Notify backend of UI events
- [ ] Bidirectional state sync
- [ ] Conflict resolution
- [ ] State change events
- [ ] Debouncing for performance

**Technical Tasks**:
- Implement state sync protocol
- Create event emitters
- Build conflict resolution
- Add change notifications
- Implement debouncing
- Test sync scenarios

---

## Epic 7: Network Access & Progressive Trust

**Priority**: P2 (Medium)  
**Estimated Duration**: 2 weeks  
**Dependencies**: Epic 5

### Goals
Enable plugins to make HTTP requests with user approval and rate limiting.

### User Stories

#### 7.1 HTTP Request API
**As a** plugin developer  
**I want** to make HTTP requests to external APIs  
**So that** I can fetch data for my plugin

**Acceptance Criteria**:
- [ ] Support GET, POST, PUT, DELETE methods
- [ ] Custom headers and body
- [ ] Response parsing (JSON, text, binary)
- [ ] Error handling
- [ ] Timeout configuration
- [ ] Request/response logging

**Technical Tasks**:
- Implement HTTP client wrapper
- Add request validation
- Support multiple content types
- Implement error handling
- Add timeout logic
- Create request logger

#### 7.2 Progressive Trust Model
**As a** user  
**I want** to approve new domains before plugins access them  
**So that** I control what data plugins can access

**Acceptance Criteria**:
- [ ] Whitelist domains in manifest
- [ ] User approval for new domains
- [ ] "Always allow" option
- [ ] Domain approval persistence
- [ ] Revoke domain access
- [ ] View approved domains

**Technical Tasks**:
- Implement domain whitelist checker
- Create approval dialog UI
- Store approved domains
- Add revocation functionality
- Build domain management UI
- Test approval flow

#### 7.3 Rate Limiting
**As a** system  
**I want** to limit plugin HTTP requests  
**So that** plugins can't abuse network resources

**Acceptance Criteria**:
- [ ] Configure rate limits in manifest
- [ ] Enforce requests per minute
- [ ] Enforce requests per hour
- [ ] Block requests when limit exceeded
- [ ] Show rate limit status
- [ ] Reset limits periodically

**Technical Tasks**:
- Implement rate limiter service
- Add per-plugin tracking
- Enforce limits on requests
- Create limit status UI
- Add automatic reset
- Test with high-volume plugins

---

## Epic 8: Advanced Features & Polish

**Priority**: P3 (Low)  
**Estimated Duration**: 3-4 weeks  
**Dependencies**: All previous epics

### Goals
Add advanced features, polish UI/UX, and prepare for production deployment.

### User Stories

#### 8.1 Plugin Marketplace UI
**As a** user  
**I want** to discover and install plugins from a marketplace  
**So that** I can extend Nodex easily

**Acceptance Criteria**:
- [ ] Browse available plugins
- [ ] Search and filter plugins
- [ ] View plugin details and screenshots
- [ ] One-click install
- [ ] Plugin ratings and reviews
- [ ] Update notifications

**Technical Tasks**:
- Design marketplace UI
- Create plugin catalog
- Implement search/filter
- Build plugin detail view
- Add install functionality
- Create update checker

#### 8.2 Plugin Signing & Verification
**As a** user  
**I want** plugins to be signed by developers  
**So that** I can trust their authenticity

**Acceptance Criteria**:
- [ ] Generate plugin signatures
- [ ] Verify signatures on install
- [ ] Show verification status
- [ ] Warn about unsigned plugins
- [ ] Developer identity verification
- [ ] Certificate management

**Technical Tasks**:
- Implement signing algorithm
- Create signature generator
- Build verification logic
- Add UI indicators
- Set up certificate system
- Test signing flow

#### 8.3 Plugin Analytics & Telemetry
**As a** plugin developer  
**I want** to see usage analytics for my plugin  
**So that** I can improve it

**Acceptance Criteria**:
- [ ] Track plugin installs
- [ ] Track plugin usage
- [ ] Track errors and crashes
- [ ] Performance metrics
- [ ] User feedback collection
- [ ] Privacy-respecting analytics

**Technical Tasks**:
- Implement telemetry service
- Add usage tracking
- Create error reporting
- Build analytics dashboard
- Add feedback mechanism
- Ensure privacy compliance

#### 8.4 Documentation & Examples
**As a** plugin developer  
**I want** comprehensive documentation and examples  
**So that** I can learn quickly

**Acceptance Criteria**:
- [ ] API reference documentation
- [ ] Tutorial series
- [ ] Example plugins (5+)
- [ ] Best practices guide
- [ ] Troubleshooting guide
- [ ] Video tutorials

**Technical Tasks**:
- Write API documentation
- Create tutorial content
- Build example plugins
- Document best practices
- Create troubleshooting guide
- Record video tutorials

#### 8.5 Testing & Quality Assurance
**As a** developer  
**I want** comprehensive tests  
**So that** the plugin system is reliable

**Acceptance Criteria**:
- [ ] Unit tests for core services
- [ ] Integration tests for plugin loading
- [ ] E2E tests for plugin IDE
- [ ] Security tests for sandboxing
- [ ] Performance benchmarks
- [ ] 80%+ code coverage

**Technical Tasks**:
- Set up testing framework
- Write unit tests
- Create integration tests
- Build E2E test suite
- Add security tests
- Measure coverage

---

## Implementation Timeline

### Phase 1: Foundation (Weeks 1-4)
- Epic 1: Foundation & Core Plugin System

### Phase 2: Distribution (Weeks 5-7)
- Epic 2: Plugin Distribution & Packaging

### Phase 3: Dependencies (Weeks 8-11)
- Epic 3: Dependency Management System

### Phase 4: Development Tools (Weeks 12-16)
- Epic 4: Built-in Plugin IDE

### Phase 5: Backend & Security (Weeks 17-21)
- Epic 5: Backend Isolation & Child Processes
- Epic 6: State Persistence & Database

### Phase 6: Network & Trust (Weeks 22-23)
- Epic 7: Network Access & Progressive Trust

### Phase 7: Polish & Launch (Weeks 24-27)
- Epic 8: Advanced Features & Polish

**Total Estimated Duration**: 27 weeks (~6.5 months)

---

## Success Metrics

### Technical Metrics
- [ ] All plugins load in <500ms (production mode)
- [ ] Plugin IDE compiles JSX in <1s
- [ ] Zero main process crashes from plugins
- [ ] 100% of plugins sandboxed properly
- [ ] <100MB memory per plugin
- [ ] 80%+ test coverage

### User Experience Metrics
- [ ] Plugin creation time <15 minutes (with IDE)
- [ ] Plugin installation time <5 seconds
- [ ] User satisfaction score >4.5/5
- [ ] <5% plugin installation failures
- [ ] Developer onboarding time <1 hour

### Security Metrics
- [ ] Zero XSS vulnerabilities
- [ ] 100% permission enforcement
- [ ] All network requests logged
- [ ] No eval() or unsafe code execution
- [ ] CSP violations = 0

---

## Risk Mitigation

### Technical Risks
1. **JSX Compilation Performance**: Mitigate with caching and incremental compilation
2. **Child Process Overhead**: Limit concurrent processes, implement pooling
3. **Dependency Conflicts**: Strict isolation per plugin
4. **Memory Leaks**: Implement cleanup hooks, monitor usage

### User Experience Risks
1. **Complex UI**: Iterative design, user testing
2. **Steep Learning Curve**: Comprehensive docs, templates
3. **Plugin Discovery**: Curated marketplace, featured plugins

### Security Risks
1. **Malicious Plugins**: Signing, review process, sandboxing
2. **Data Exfiltration**: Network approval, rate limiting
3. **Resource Abuse**: Quotas, monitoring, kill switches

---

## Next Steps

1. **Review & Approve** this Epic plan
2. **Set up project tracking** (GitHub Projects, Jira, etc.)
3. **Assign team members** to epics
4. **Begin Epic 1** implementation
5. **Weekly progress reviews** and plan adjustments
6. **Continuous documentation** updates

---

## Notes

- This plan assumes a team of 2-3 developers working full-time
- Timelines are estimates and may need adjustment
- Epics can be parallelized where dependencies allow
- User feedback should be incorporated throughout
- Security reviews should happen at each phase completion
