/** Persisted choice on first launch (Electron only). */
export const ELECTRON_RUN_MODE_STORAGE_KEY = "nodex.electron.runMode";

export type ElectronRunModeChoice = "scratch" | "notes";

export type ElectronRunMode = ElectronRunModeChoice | "unset";

function normalizeAndMigrateStoredValue(raw: string | null): ElectronRunMode {
  if (raw === "scratch" || raw === "notes") {
    return raw;
  }
  /** Legacy `local` / `cloud` → single Notes path (local-first + optional sync). */
  if (raw === "local" || raw === "cloud") {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ELECTRON_RUN_MODE_STORAGE_KEY, "notes");
    }
    return "notes";
  }
  return "unset";
}

export function readElectronRunMode(): ElectronRunMode {
  if (typeof window === "undefined") {
    return "unset";
  }
  const v = localStorage.getItem(ELECTRON_RUN_MODE_STORAGE_KEY);
  return normalizeAndMigrateStoredValue(v);
}

export function writeElectronRunMode(mode: ElectronRunModeChoice): void {
  localStorage.setItem(ELECTRON_RUN_MODE_STORAGE_KEY, mode);
}

/** Next launch (and in-memory state) treats run mode as unset → Electron welcome / run-mode picker. */
export function clearElectronRunMode(): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(ELECTRON_RUN_MODE_STORAGE_KEY);
}
