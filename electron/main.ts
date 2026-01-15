import { app, BrowserWindow, ipcMain, contextBridge } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { autoUpdater } from "electron-updater";

import { downloadGame } from "./game/download";
import { checkGameInstallation } from "./game/check";
import { launchGame } from "./game/launch";

const require = createRequire(import.meta.url);

contextBridge.exposeInMainWorld("nodeRequire", require);

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;

autoUpdater.autoDownload = true;

autoUpdater.on("update-available", () => {
  win?.webContents.send("update-available");
});

autoUpdater.on("update-downloaded", () => {
  win?.webContents.send("update-downloaded");
});

function createWindow() {
  win = new BrowserWindow({
    width: 1026,
    height: 640,
    frame: false,
    titleBarStyle: "hidden",
    resizable: false,
    backgroundColor: "#00000000",
    icon: path.join(process.env.VITE_PUBLIC!, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  if (!VITE_DEV_SERVER_URL) {
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.on("minimize-window", () => {
  win?.minimize();
});

ipcMain.on("close-window", () => {
  win?.close();
});

ipcMain.handle("fetch:json", async (_, url, ...args) => {
  const response = await fetch(url, ...args);
  return await response.json();
});

ipcMain.handle("get-default-game-directory", () => {
  return path.join(app.getPath("userData"), "Hytale");
});

ipcMain.handle("check-game-installation", (_, baseDir: string) => {
  return checkGameInstallation(baseDir);
});

ipcMain.on("init-install", (e, baseDir: string) => {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    downloadGame(baseDir, win);
  }
});

ipcMain.on(
  "launch-game",
  (e, baseDir: string, username: string, releaseType: string) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      launchGame(baseDir, username, win, releaseType);
    }
  }
);
