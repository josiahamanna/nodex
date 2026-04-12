/** Public API version prefix for all sync-api HTTP routes (except root `GET /health` for probes). */
export const NODEX_SYNC_API_V1_PREFIX = "/api/v1";

/** Map a route path (e.g. `/auth/login`) to the full mounted path (`/api/v1/auth/login`). */
export function syncApiV1Path(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (
    p === NODEX_SYNC_API_V1_PREFIX ||
    p.startsWith(`${NODEX_SYNC_API_V1_PREFIX}/`)
  ) {
    return p;
  }
  return `${NODEX_SYNC_API_V1_PREFIX}${p}`;
}
