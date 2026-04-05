# Shell shortcuts, keymaps, JS notebook, and UI SDK

## Consolidated plan (executive summary)

**Goal:** Improve shell UX and extensibility: keyboard behavior when embedded views hold focus, predictable keymaps, JS notebook as primary content, chrome built from React + SDK, and a **trusted-extension** model (policy + capabilities, not JS blacklists).

**Cross-cutting: iframe is optional.** Use a **sandboxed iframe** when you want isolation (legacy plugins, extra defense for user cell code, crash containment, CSP). Use **host-rendered React** when you want simpler integration and global shortcuts without bridging. Regions can mix (e.g. host sidebar + iframe primary, or both host).

| Topic | Decision |
|-------|----------|
| **Global shortcuts + focus** | Parent `window` does not get `keydown` from a focused **child iframe**. **Fix:** `postMessage` bridge from iframe → host (reuse/extend shell RPC), or avoid iframe for that surface. Optional helper in a future `@nodex/shell-client`. |
| **Duplicate key chords** | `ShellKeymapRegistry` is keyed by **`id`**, not chord; duplicates possible. **Fix:** stable binding `id` + **chord uniqueness** or eviction on register. Registry stays source of truth; tinykeys/hotkeys only if needed for parsing. |
| **JS notebook** | **Embed `@observablehq/runtime`** in main area; system/first-party plugin; storage/sync TBD; license compliance. **No security requirement to iframe** the runtime if trusted; iframe **optional** for hardening. **User cell code** may need Workers / restricted eval separately. |
| **Trust model** | **Trusted extensions:** manifest, capabilities, signing/marketplace, user consent. |
| **Sidebar / secondary** | **Exported React FCs** from plugin bundles; **`@nodex/shell-ui`** primitives; **`nodex`** via context/hooks; cross-plugin via **commands/RPC** only. |
| **Primary** | **Trusted host React** and/or **iframe** views; **iframe optional** for system content. |
| **Existing `@nodex/plugin-ui`** | **Note** iframes only; shell chrome needs **`@nodex/shell-ui` / shell-client** aligned with policy. |

**Workstreams:**

1. **Keyboard forwarding for iframe focus** (bridge): implement a host message handler + an iframe keydown forwarder injection for `srcDoc` iframes.
2. **Keymap correctness**: enforce a chord policy (last-wins / replace-on-register) so re-binding does not leave stale chords.
3. **JS notebook**: embed `@observablehq/runtime`, define persistence model for notebooks and cell edits, and define where user cell JS runs (main thread vs Worker).
4. **SDK & capabilities**: define `@nodex/shell-ui` and `nodex` capability surfaces for trusted extension bundles.

---

## 1. Global shortcuts when focus is in an iframe (primary area)

The shell registers a capture-phase listener on the parent window:

- See `src/renderer/shell/useNodexShell.ts` — `window.addEventListener("keydown", ..., true)`

When focus is inside a sandboxed iframe (`ShellIFrameViewHost`), keydown events are handled in the iframe document and do not bubble to the parent. Fix by forwarding normalized chords from iframe → host via `postMessage`, then matching `ShellKeymapRegistry` in the host.

---

## 2. Duplicate shortcuts / rebinding not unbinding previous chords

`ShellKeymapRegistry` stores bindings by `id`, so registering a new binding (new id) leaves the old chord active. Fix by adding a `chord -> id` index (or equivalent policy) and ensuring register replaces/evicts old chord owners.

---

## 3. JS notebook in primary area

Decision: embed `@observablehq/runtime` (not a hosted iframe). As a first-party plugin, an iframe is not required for trust; keep iframe as an optional hardening layer.

Key follow-up: user-written cell code isolation (Workers or other).

---

## 4. Trusted extensions model + UI SDK

- Plugins are “trusted”: enforce boundaries via manifest + capabilities, distribution policy, and stable APIs.
- Sidebar/secondary accept exported React functional components (host-rendered) + `@nodex/shell-ui` primitives.
- Primary may be host-rendered or iframe-based depending on desired isolation.

