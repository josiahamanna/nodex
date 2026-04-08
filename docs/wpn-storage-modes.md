# WPN storage modes (product defaults)

This document records **agreed defaults** for open product questions from the Mongo vs file vault plan. Implementations may evolve; update this file when behavior changes.

## First sign-in from Electron local vault → Mongo

| Default | **Cloud wins** |
|--------|----------------|
| Rationale | Avoid silently overwriting a user’s cloud tree with an unvetted local upload. |
| Behavior | After sign-in, the **cloud** workspace is the working set. The **local vault folder is left on disk** unchanged until the user explicitly exports or replaces cloud content (future UX). |
| Alternatives | *Upload-and-replace* (local overwrites cloud) and *merge* remain product options for a dedicated migration flow. |

## Sign-out from cloud (Mongo) → local file

| Default | **Discard-local session** |
|--------|---------------------------|
| Rationale | No automatic filesystem writes on sign-out; avoids surprising exports. |
| Behavior | Tokens/session cleared; user returns to **local vault mode** (or scratch) without writing Mongo state to disk. |
| Alternatives | **Export snapshot** — explicit “Export cloud to folder…” (user picks destination). |

## Signed-in offline read cache

| Default | **In-memory + optional short-lived session cache** |
|--------|-----------------------------------------------------|
| Rationale | Reload while offline should not imply that unsaved UI or edits were persisted. |
| Behavior | See renderer `signed-in-cloud-offline.ts`: mutations and durable chrome persistence are blocked when offline; try-out scratch (web) remains IDB-backed. |

## Electron: local vs cloud window

| UX | **File → New cloud WPN window** (`Cmd/Ctrl+Shift+N`) vs **New local window** |
|----|-------------------------------------------------------------------------------|
| Backend | Cloud windows use `__NODEX_ELECTRON_WPN_BACKEND__ === "cloud"` and HTTP WPN; local windows use file IPC. |
| Isolation | Cloud windows **cannot** open a folder project or touch file-vault WPN via IPC (main blocks those IPCs). |

## Single active session (401 on refresh)

New login **rotates** the refresh-token family server-side. Other clients get **401** on `/auth/refresh` and must sign in again. UI copy: e.g. “Signed in elsewhere” or “Session expired.”
