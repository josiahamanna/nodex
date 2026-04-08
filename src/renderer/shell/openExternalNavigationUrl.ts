import { getNodex } from "../../shared/nodex-host-access";
/**
 * Prefer Electron `openExternalUrl` (system browser); fall back to `window.open`.
 */
export async function openExternalNavigationUrl(url: string): Promise<void> {
  const api = typeof window !== "undefined" ? getNodex() : undefined;
  if (api?.openExternalUrl) {
    try {
      const r = await api.openExternalUrl(url);
      if (r.ok) {
        return;
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
