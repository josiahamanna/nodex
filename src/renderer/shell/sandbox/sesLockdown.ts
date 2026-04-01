/**
 * One-time SES hardening for the renderer before loading untrusted plugin code.
 * System (first-party) plugins may bypass compartments; user plugins should run in Compartment.
 */
const g = globalThis as { __nodexSesLockdown?: boolean };

export function ensureSesLockdown(): void {
  if (g.__nodexSesLockdown || typeof window === "undefined") {
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ses = require("ses") as { lockdown?: (opts?: unknown) => void };
    if (typeof ses.lockdown === "function") {
      ses.lockdown();
      g.__nodexSesLockdown = true;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[nodex] SES lockdown not applied:", err);
  }
}
