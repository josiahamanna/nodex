# Fix Login/Signup Page Freeze Issue

Move heavy database operations (note migration, hydration, sync) to run asynchronously after page reload instead of blocking the login flow, with progress indicators and partial app access during background operations.

## Implementation Scope

**Phase 1:** Fix the freeze by removing heavy operations from login/signup
**Phase 2:** Add progress notifications and allow partial app interaction during sync

Both phases will be implemented together for a complete solution.

## Will This Cause Data Lag?

**No, it will actually improve the experience:**

1. **Loading state already exists** - The app shows "Loading…" screen (AuthGate.tsx:169-174) while operations run
2. **Operations already run on page load** - `cloudRestoreSessionThunk` (cloudAuthSlice.ts:133-137) runs the same operations when restoring session
3. **Currently operations run TWICE** - Once during login, once after reload (wasteful!)
4. **After fix** - Operations run only once, after reload, with proper loading UI

**User Experience Comparison:**

**Before (Current - BAD):**
1. Click login → Page freezes → "Page Unresponsive" dialog → Wait 5-10s → Reload → Operations run again → App loads
2. Total time: ~10-15 seconds, with freeze

**After (Fixed - GOOD):**
1. Click login → Immediate reload → "Loading…" screen → Operations run → App loads
2. Total time: ~5-7 seconds, no freeze, proper feedback

## Problem Analysis

After clicking login/signup, the page freezes and shows "Page Unresponsive" because:

1. **Login flow** (`cloudLoginThunk` in `cloudAuthSlice.ts:153-169`):
   - Line 163: `migrateWebScratchCloudNotesIfNeeded(userId)` - Migrates notes from scratch storage
   - Line 164-166: `hydrateCloudNotesFromRxDbThunk()` - Loads all notes from IndexedDB into Redux
   - Line 167: `runCloudSyncThunk()` - Syncs notes with server
   - All these run **before** returning, blocking the main thread

2. **Signup flow** (`cloudRegisterThunk` in `cloudAuthSlice.ts:175+`):
   - Same heavy operations run before completion

3. **Current reload logic** (`AuthContext.tsx:278-280`):
   - Reload happens AFTER the thunk completes
   - But the thunk is blocked waiting for heavy operations
   - User sees frozen page during this time

## Solution Approach

### Option 1: Defer Operations Until After Reload (Recommended)
**Pros:** Fastest login, cleanest UX
**Cons:** Need to ensure operations run on next page load

**Changes:**
1. Remove heavy operations from `cloudLoginThunk` and `cloudRegisterThunk`
2. Keep only: save tokens, set auth state
3. Reload page immediately after token save
4. Add initialization logic to run operations after reload in `AuthContext` or `App.tsx`

### Option 2: Run Operations in Background
**Pros:** Preserves exact current behavior
**Cons:** More complex, still may cause some UI lag

**Changes:**
1. Wrap heavy operations in `setTimeout(() => {...}, 0)` or `queueMicrotask()`
2. Show loading indicator while operations run
3. Reload after operations complete in background

### Option 3: Use Web Worker
**Pros:** True non-blocking
**Cons:** Very complex, RxDB/IndexedDB may not work in worker context

## Recommended Implementation Plan

**Phase 1: Fix Freeze + Add Progress Indicators**

1. **Modify `cloudLoginThunk`** (`src/renderer/store/cloudAuthSlice.ts`):
   - Remove lines 163-167 (heavy operations)
   - Keep only: save tokens, return user data
   
2. **Modify `cloudRegisterThunk`** (same file):
   - Remove similar heavy operations
   - Keep only: save tokens, return user data

3. **Enhance `cloudRestoreSessionThunk`** (same file, lines 133-137):
   - Already runs the operations after reload
   - Add progress tracking with Redux state or toast notifications
   - Update `syncStatus` state during each operation phase

4. **Add progress UI** - Two approaches (can do both):

   **A. Toast Notifications (Non-blocking)**
   - Use existing `ToastContext` (`src/renderer/toast/ToastContext.tsx`)
   - Show info toast: "Syncing your notes..." when operations start
   - Show success toast: "Sync complete" when done
   - User can interact with app while toast is visible
   
   **B. Status Banner (Subtle)**
   - Add small banner at top/bottom of app during sync
   - Show: "🔄 Syncing notes... (Step 1/3: Migrating)"
   - Doesn't block interaction, just informs user
   - Auto-dismiss when complete

5. **Allow partial app access during sync**:
   - Change AuthGate to show app immediately after auth
   - Let background operations run without blocking UI
   - Disable only note-editing features until sync completes
   - User can browse UI, settings, etc. while syncing

**Phase 2: Enhanced UX (Recommended)**

1. **Progress indicator with steps**:
   ```
   🔄 Setting up your workspace...
   ✓ Migration complete
   🔄 Loading notes from local storage...
   ✓ Notes loaded (42 notes)
   🔄 Syncing with server...
   ✓ All done!
   ```

2. **Graceful degradation**:
   - Show "Notes loading..." placeholder in note list
   - Allow user to open settings, browse plugins
   - Enable full features once sync completes

3. **Error handling**:
   - If sync fails, show error toast
   - Allow retry button
   - App still usable even if sync fails

## Files to Modify

**Core Changes:**
1. `src/renderer/store/cloudAuthSlice.ts` - Remove heavy ops from login/signup thunks, add progress tracking
2. `src/renderer/auth/AuthContext.tsx` - Already has reload logic
3. `src/renderer/auth/AuthGate.tsx` - May allow partial app access during sync

**Progress UI (Phase 2):**
4. `src/renderer/store/cloudNotesSlice.ts` - Add sync progress state (already has syncStatus)
5. `src/renderer/toast/ToastContext.tsx` - Use for progress notifications (already exists)
6. `src/renderer/App.tsx` or new component - Add status banner if needed

## Testing Checklist

**Phase 1 - Core Fix:**
- [ ] Login with valid credentials - page reloads immediately, no freeze
- [ ] Signup with new account - page reloads immediately, no freeze  
- [ ] After reload, notes are loaded and synced
- [ ] Scratch notes are migrated properly
- [ ] Network tab shows operations happen after reload
- [ ] No "Page Unresponsive" dialog appears

**Phase 2 - Progress & Partial Access:**
- [ ] Toast notification shows "Syncing notes..." after login
- [ ] User can see app UI while sync is in progress
- [ ] Progress indicator updates through each step
- [ ] Success toast shows when sync completes
- [ ] User can browse settings/plugins during sync
- [ ] Note editing is disabled until sync completes
- [ ] Error toast shows if sync fails
- [ ] Retry works if sync fails
