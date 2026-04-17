# ⚠️ Next.js Dev Server Restart Required

## Changes Made

Updated `apps/nodex-web/.env.local` to fix the pending/blocked network requests:

- **Removed**: `NEXT_PUBLIC_NODEX_API_SAME_ORIGIN=1`
- **Added**: `NEXT_PUBLIC_NODEX_SYNC_API_URL=http://127.0.0.1:4010/api/v1`

## Why This Fixes the Issue

The web app was configured to use same-origin API calls, but Next.js wasn't properly proxying those requests to the sync-api backend. Now the browser will connect directly to the sync-api on port 4010.

## Action Required

**Restart the Next.js dev server** for the environment variable changes to take effect:

```bash
# Stop the current dev server (Ctrl+C in the terminal where it's running)
# Then restart it:
cd /home/niveus/Playground/nodex
npm run dev:web
```

Or if using a different command, restart however you normally start the web app.

## Verification

After restarting:

1. Open the browser and refresh the page
2. Check the Network tab - requests should now go to `http://127.0.0.1:4010/api/v1/*`
3. The requests should no longer be stuck in "pending" state

## Prerequisites

- Sync-API must be running on port 4010 (`npm run sync-api`)
- MongoDB must be accessible (default: `mongodb://127.0.0.1:27017`)
- You need to sign in/register to create an authenticated session

## Troubleshooting

If requests still fail after restart:

1. **Check sync-api is running**:
   ```bash
   curl http://127.0.0.1:4010/api/v1/wpn/workspaces
   # Should return: {"error":"Missing Authorization bearer token"}
   ```

2. **Check browser console** for authentication errors

3. **Clear browser storage**:
   - Open DevTools → Application → Storage
   - Clear localStorage and sessionStorage
   - Refresh the page

4. **Verify CORS** (should already be working):
   ```bash
   curl -H "Origin: http://127.0.0.1:3000" -X OPTIONS http://127.0.0.1:4010/api/v1/wpn/workspaces -i
   # Should show access-control-allow-origin header
   ```
