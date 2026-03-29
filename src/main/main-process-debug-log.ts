import type { BrowserWindow } from "electron";
import util from "util";
import { IPC_CHANNELS } from "../shared/ipc-channels";

export type MainDebugLogLevel = "log" | "info" | "warn" | "error" | "debug";

export type MainDebugLogEntry = {
  ts: number;
  level: MainDebugLogLevel;
  text: string;
};

const MAX_LINES = 3000;
const buffer: MainDebugLogEntry[] = [];

let getMainWindow: (() => BrowserWindow | null) | null = null;

export function setMainDebugLogWindow(getWin: () => BrowserWindow | null): void {
  getMainWindow = getWin;
}

function broadcast(entry: MainDebugLogEntry): void {
  const win = getMainWindow?.();
  if (!win || win.isDestroyed()) {
    return;
  }
  try {
    win.webContents.send(IPC_CHANNELS.PLUGIN_IDE_MAIN_DEBUG_LOG, entry);
  } catch {
    /* ignore */
  }
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === "string"
        ? a
        : util.inspect(a, {
            depth: 5,
            maxStringLength: 12_000,
            breakLength: 100,
            compact: false,
          }),
    )
    .join(" ");
}

function append(level: MainDebugLogLevel, args: unknown[]): void {
  const text = formatArgs(args);
  const entry: MainDebugLogEntry = { ts: Date.now(), level, text };
  buffer.push(entry);
  if (buffer.length > MAX_LINES) {
    buffer.splice(0, buffer.length - MAX_LINES);
  }
  broadcast(entry);
}

let installed = false;

export function installMainProcessDebugLogTap(): void {
  if (installed) {
    return;
  }
  installed = true;
  const c = globalThis.console;
  const origLog = c.log.bind(c);
  const origInfo = c.info.bind(c);
  const origWarn = c.warn.bind(c);
  const origError = c.error.bind(c);
  const origDebug = c.debug.bind(c);

  c.log = (...args: unknown[]) => {
    append("log", args);
    origLog(...args);
  };
  c.info = (...args: unknown[]) => {
    append("info", args);
    origInfo(...args);
  };
  c.warn = (...args: unknown[]) => {
    append("warn", args);
    origWarn(...args);
  };
  c.error = (...args: unknown[]) => {
    append("error", args);
    origError(...args);
  };
  c.debug = (...args: unknown[]) => {
    append("debug", args);
    origDebug(...args);
  };
}

export function getMainDebugLogBuffer(): MainDebugLogEntry[] {
  return buffer.slice();
}

export function clearMainDebugLogBuffer(): void {
  buffer.length = 0;
}
