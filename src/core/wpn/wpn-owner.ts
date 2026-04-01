/** Default WPN row owner when `NODEX_WPN_DEFAULT_OWNER` is unset (server / Electron main). */
export function getWpnOwnerId(): string {
  const raw = process.env.NODEX_WPN_DEFAULT_OWNER?.trim();
  return raw && raw.length > 0 ? raw : "jehu";
}
