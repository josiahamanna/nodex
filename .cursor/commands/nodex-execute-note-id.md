# nodex-execute-note-id

## Nodex note → fetch → write Result child

The user wants to run the Nodex MCP workflow for **one** note.

## Note id

Extract a **single UUID** from the user’s latest message(s) (the same message as this command or immediately after). If none is found, ask once for the note id and stop.

Call that value `NOTE_ID`.

After you load that note (see **Steps**), treat its **content** as the task spec: read it carefully and **carry out those instructions** (research, edits, analysis, checklist, etc.)—not a generic summary unless the note itself only asks for a summary.

When finished, **persist the outcome in Nodex** by creating a **direct child** of `NOTE_ID` via `nodex_write_back_child`, with **title** = `Result: ` + the original note title (same name, with `Result: ` prepended; use `Result: (untitled)` if there is no title) and **content** = your full result (markdown).

## Authenticate Nodex MCP (when tools return unauthenticated)

Authenticate Nodex MCP using the browser device flow. Prerequisites: MCP is configured with `NODEX_MCP_CLOUD_SESSION=1`.

1. Call `nodex_login_browser_start` (no arguments). From the JSON response, read `verification_uri`, `device_code`, `user_code`, and `expires_in`.

2. Reply with one short message for the user: paste the full `verification_uri` as a clickable link (and optionally the `user_code` for reference). Tell them to open that URL, sign in if needed, and click Authorize — they will do only that; do not ask them to copy the `device_code` or run any commands.

3. Immediately start polling `nodex_login_browser_poll` with the `device_code` from step 1 (never print or paste the `device_code` in chat). Poll until the response status is `authorized`, or `expired`/`invalid`, or until roughly `expires_in` seconds have passed. Use a sensible delay between polls (e.g. start at 3–5 seconds; if the API returns a suggested interval, follow it). If status is `pending`, keep polling.

4. When status is `authorized`, call `nodex_auth_status` and briefly confirm the user is authenticated (mode, authenticated flag). If expired or invalid, say so and offer to restart from step 1.

Do not use `nodex_login` (password). Do not stop after start — you must run the poll loop yourself after giving the user the link.

## Steps

1. If any Nodex tool returns unauthenticated, run **Authenticate Nodex MCP** above, then retry the workflow.

2. Call `nodex_get_note` with `noteId`: `NOTE_ID`. Read the note **title** and **content**.

3. Follow and **process the instructions in the note body** (the note is the source of truth for what to do). If the note is ambiguous, make reasonable assumptions and state them briefly in the result.

4. Call `nodex_write_back_child` to push the outcome back under the same note:
   - `taskNoteId`: `NOTE_ID`
   - `title`: `Result: ` + original title (use `Result: (untitled)` if no title)
   - `content`: markdown outcome from step 3

5. Reply briefly with parent id, new child title, and any error from the tools.
