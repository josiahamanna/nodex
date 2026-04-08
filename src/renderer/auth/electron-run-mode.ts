/** Persisted choice on first launch (Electron only). */
export const ELECTRON_RUN_MODE_STORAGE_KEY = "nodex.electron.runMode";

export type ElectronRunModeChoice = "local" | "cloud";

export type ElectronRunMode = ElectronRunModeChoice | "unset";

export function readElectronRunMode(): ElectronRunMode {
  if (typeof window === "undefined") {
    return "unset";
  }
  const v = localStorage.getItem(ELECTRON_RUN_MODE_STORAGE_KEY);
  if (v === "local" || v === "cloud") {
    return v;
  }
  return "unset";
}

export function writeElectronRunMode(mode: ElectronRunModeChoice): void {
  localStorage.setItem(ELECTRON_RUN_MODE_STORAGE_KEY, mode);
}
