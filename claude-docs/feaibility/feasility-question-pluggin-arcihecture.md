## React Development Environment
##### Your Requirement:

> Plugins should be developed inside Nodex leveraging the same React (and Redux) as the main application. 

##### Windsurf Architecture:

> Uses bundled libraries in plugins, not shared React instance

##### Feasibility Questions:

* Q1: Should plugins share the main app's React/Redux instance, or bundle their own?
    * Option A: Share main app's React (tighter coupling, smaller plugin size, version conflicts)
    * Option B: Bundle own React (isolation, larger size, no version conflicts)
> **Which is better for our use case? I want to develop the scripts and plugins inside Nodex itself, so that the developer doesn't have to switch between Nodex and other IDEs.**
* Q2: How will plugins be developed "inside Nodex"?
    * Option A: Built-in plugin development IDE/editor within Nodex?
    * Option B: Hot-reload from external directory during development?
    * Option C: Something else?
> **Built-in plugin development IDE/editor within Nodex is what users want here.**
## Backend Sandboxing Strategy

##### Your Requirement:

> Backend should run in worker thread

##### Windsurf Architecture:

> Backend runs in separate Node.js process (child_process)

##### Feasibility Questions:

* Q3: Which isolation approach?
    * Option A: Worker threads (same process, lighter, shared memory possible)
    * Option B: Child processes (complete isolation, heavier, more secure)
    * Option C: Hybrid (worker threads with process fallback for untrusted plugins)
Trade-offs:
> **Option B**

Worker threads: Faster IPC, but shared V8 heap (potential security risk)
Child processes: Complete isolation, but slower IPC and higher memory usage
## File Structure Validation
##### Your Requirement:

> Should fail with warning if structure not followed. System should not crash.

##### Windsurf Architecture:

> Doesn't specify validation behavior

##### Feasibility Questions:

Q4: What's the minimum required structure?
* Must have: manifest.json, main.js
> **Yes, this is correct**
* Optional: index.html, index.js (for UI plugins)
> **Yes, this is correct**
* Should we auto-detect plugin type based on files present?
> **Yes, this is correct**
## Database Access Scope
##### Your Requirement:

> Database - only to its data

##### Windsurf Architecture:

> Plugin-specific tables with naming convention: plugin_${name}_data

##### Feasibility Questions:

Q5: How should database isolation work?
* Option A: Prefix-based (as in Windsurf doc): plugin_markdown_data
* Option B: Separate namespaced storage per plugin (host-mediated; not raw per-plugin SQL files)
* Option C: Virtual tables with row-level security
> **Option A is better for our use case**
* Q6: Can plugins query note content/metadata?
* Should plugins access notes table read-only?
* Or only through API methods like api.getNote(id)?
> **Plugins should access notes table read-only**
## Network Access
##### Your Requirement:

Network (careful exposure)

##### Windsurf Architecture:

HTTP requests require permission, provided via api.http.get/post

##### Feasibility Questions:

* Q7: What network restrictions?
* Option A: Whitelist domains in manifest
* Option B: User approval per request
* Option C: Rate limiting only
* Option D: All of the above
## Plugin Packaging
##### Your Requirement:

> Final plugin should have different extension than .zip (e.g. .Nodexplugin)

##### Windsurf Architecture:

> Uses .zip format

##### Feasibility Questions:

Q8: Should .Nodexplugin be:
* Option A: Just a renamed .zip file (same format)
> **Yes, this is correct**
* Option B: Custom format with signature/encryption
> **No, this is not necessary**
* Option C: Zip with manifest validation on install
> **Yes, this is correct**
## React Integration Details
Critical Question:

* Q9: If plugins use main app's React, how do we handle:
Version updates (what if main app upgrades React 18 → 19)?
Plugin compatibility (old plugins break with new React)?
Bundle size (if we share, how do we expose it to iframe sandbox)?
Possible Solutions:

A: Expose React via window.Nodex.React in iframe
B: Inject React into plugin iframe context
C: Require plugins to bundle React (no sharing)
## State Persistence Scope
##### Your Answer:

> Both depends on the use case. But what do you suggest?

My Recommendation:

> Per-note state: Cursor position, scroll, editor-specific UI state
Global state: User preferences, plugin settings, cached data

Feasibility Question:

* Q10: Should we provide both APIs and let plugin decide? (Windsurf does this)
> **Yes, this is correct**

## CSP and Security
##### Windsurf Architecture:

default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
##### Feasibility Questions:

* Q11: If we share React from main app, we need to allow:
* script-src 'self' or specific parent origin
* This weakens CSP - acceptable trade-off?

> **No, this is not acceptable. But we need to find a way to share React without weakening CSP so that developers can extend Nodex with React components.**
