import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "node:url";
import { BrowserWindow, Menu, app, type MenuItemConstructorOptions } from "electron";
import { IPC_CHANNELS } from "../shared/ipc-channels";
import { ctx } from "./main-context";

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

function resolveMainWindowLoadUrl(): string {
  if (process.env.NODE_ENV === "development") {
    return process.env.NODEX_WEB_DEV_URL ?? "http://127.0.0.1:3000";
  }
  const packaged = path.join(process.resourcesPath, "nodex-web", "index.html");
  if (fs.existsSync(packaged)) {
    return pathToFileURL(packaged).href;
  }
  return MAIN_WINDOW_WEBPACK_ENTRY;
}

export function createMainWindow(): void {
  ctx.mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      /** Never disable DevTools; production debugging uses F12 / Ctrl+Shift+I / (macOS) Cmd+Opt+I. */
      devTools: true,
    },
  });
  /**
   * `runAppReady` clears the app menu (`Menu.setApplicationMenu(null)`). Without a replacement,
   * Linux/Windows lose menu accelerators; macOS keeps no menu at all — restore a minimal menu with
   * View → Toggle Developer Tools (menu bar visible; F12 / Ctrl+Shift+I still work).
   */
  const appMenu: MenuItemConstructorOptions =
    process.platform === "darwin"
      ? {
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }
      : {
          label: app.name,
          submenu: [{ role: "quit" }],
        };

  const template: MenuItemConstructorOptions[] = [
    appMenu,
    {
      label: "View",
      submenu: [
        { role: "reload", accelerator: "CmdOrCtrl+R" },
        { type: "separator" },
        /** Default accelerator is Ctrl+Shift+I (Linux/Win); F12 / Cmd+Opt+I in before-input-event. */
        { role: "toggleDevTools" },
      ],
    },
  ];

  if (process.env.NODE_ENV === "development") {
    template.push({
      label: "Developer",
      submenu: [
        {
          label: "Log contribution registry count",
          accelerator:
            process.platform === "darwin"
              ? "Alt+Cmd+Shift+L"
              : "Ctrl+Shift+Alt+L",
          click: (_item, browserWindow) => {
            const win = browserWindow ?? ctx.mainWindow;
            win?.webContents.send(IPC_CHANNELS.UI_RUN_CONTRIBUTION_COMMAND, {
              commandId: "nodex.contributions.listCommands",
            });
          },
        },
      ],
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  ctx.mainWindow.loadURL(resolveMainWindowLoadUrl());

  if (process.env.NODE_ENV === "development") {
    ctx.mainWindow.webContents.openDevTools();
  } else if (process.env.NODEX_OPEN_DEVTOOLS === "1") {
    /** Production debugging on Linux/packaged builds: `NODEX_OPEN_DEVTOOLS=1 ./nodex` */
    ctx.mainWindow.webContents.openDevTools();
  }

  ctx.mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.isAutoRepeat) {
      return;
    }
    const win = ctx.mainWindow;
    if (!win || win.isDestroyed()) {
      return;
    }

    if (input.key === "F12") {
      event.preventDefault();
      win.webContents.toggleDevTools();
      return;
    }

    const primary = input.control || input.meta;

    if (primary && input.shift && input.key.toLowerCase() === "i") {
      event.preventDefault();
      win.webContents.toggleDevTools();
      return;
    }

    if (
      process.platform === "darwin" &&
      input.meta &&
      input.alt &&
      input.key.toLowerCase() === "i"
    ) {
      event.preventDefault();
      win.webContents.toggleDevTools();
      return;
    }

    if (!primary || input.alt || input.shift) {
      return;
    }
    if (input.key.toLowerCase() !== "r") {
      return;
    }
    event.preventDefault();
    win.webContents.reload();
  });

  ctx.mainWindow.on("closed", () => {
    ctx.mainWindow = null;
  });
}
