import type { WebContents } from "electron";

/**
 * Per-renderer WPN backend: file vault (IPC + JSON on disk) vs cloud (Mongo via sync-api from renderer).
 * Registered when each BrowserWindow is created; defaults to file if unknown.
 */
const wpnBackendByWebContentsId = new Map<number, "file" | "cloud">();

export function registerWebContentsWpnBackend(
  wc: WebContents,
  mode: "file" | "cloud",
): void {
  wpnBackendByWebContentsId.set(wc.id, mode);
  wc.once("destroyed", () => {
    wpnBackendByWebContentsId.delete(wc.id);
  });
}

export function getWebContentsWpnBackend(webContentsId: number): "file" | "cloud" {
  return wpnBackendByWebContentsId.get(webContentsId) ?? "file";
}

/** Cloud windows must not mutate the on-disk vault or open local folders (strict isolation). */
export function assertElectronFileVaultWindow(e: { sender: { id: number } }): void {
  if (getWebContentsWpnBackend(e.sender.id) === "cloud") {
    throw new Error(
      "This window is a cloud WPN session. Use File → New local window to open a folder on disk.",
    );
  }
}
