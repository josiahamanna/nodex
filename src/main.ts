import { app, BrowserWindow, protocol } from "electron";
import { runAppReady } from "./main/run-app-ready";
import { registerStaticIpcHandlers } from "./main/register-static-ipc";
import { createMainWindow } from "./main/create-main-window";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "nodex-asset",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

registerStaticIpcHandlers();

app.on("ready", () => {
  runAppReady();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
