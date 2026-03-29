import { BrowserWindow } from "electron";
import { ctx } from "./main-context";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export function createMainWindow(): void {
  ctx.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (process.platform !== "darwin") {
    ctx.mainWindow.removeMenu();
  }
  ctx.mainWindow.setMenuBarVisibility(false);

  ctx.mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (process.env.NODE_ENV === "development") {
    ctx.mainWindow.webContents.openDevTools();
  }

  ctx.mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) {
      return;
    }
    const primary = input.control || input.meta;
    if (!primary || input.alt || input.shift) {
      return;
    }
    if (input.key.toLowerCase() !== "r") {
      return;
    }
    event.preventDefault();
    if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) {
      return;
    }
    ctx.mainWindow.webContents.reload();
  });

  ctx.mainWindow.on("closed", () => {
    ctx.mainWindow = null;
  });
}
