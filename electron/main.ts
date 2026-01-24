import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeImage,
  Tray,
  Menu,
} from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { autoUpdater } from "electron-updater";
import { META_DIRECTORY } from "./utils/const";
import { logger } from "./utils/logger";

import { installGame } from "./utils/game/install";
import { checkGameInstallation } from "./utils/game/check";
import { launchGame } from "./utils/game/launch";
import {
  connectRPC,
  disconnectRPC,
  setChoosingVersionActivity,
  setPlayingActivity,
} from "./utils/discord";
import { readInstallManifest } from "./utils/game/manifest";
import {
  listInstalledVersions,
  deleteInstalledVersion,
  InstalledBuildInfo,
} from "./utils/game/installed";

import {
  getLatestDir,
  getPreReleaseBuildDir,
  getPreReleaseChannelDir,
  getReleaseBuildDir,
  getReleaseChannelDir,
  migrateLegacyChannelInstallIfNeeded,
} from "./utils/game/paths";
import {
  checkOnlinePatchNeeded,
  disableOnlinePatch,
  enableOnlinePatch,
  fixClientToUnpatched,
  getOnlinePatchHealth,
  getOnlinePatchState,
} from "./utils/game/onlinePatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");

// autoUpdater config
autoUpdater.setFeedURL({
  owner: "vZylev",
  repo: "Butter-Launcher",
  provider: "github",
});

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.autoRunAppAfterInstall = true;
autoUpdater.forceDevUpdateConfig = false;

app.on("ready", () => {
  app.setAppUserModelId("com.butter.launcher");
  // only check for updates on startup in production.
  if (!process.env["VITE_DEV_SERVER_URL"]) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  logger.info(`Butter Launcher is starting...
    App Version: ${app.getVersion()}
    Platform: ${os.type()} ${os.release()}
    Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB / ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
    Electron: ${process.versions.electron}, Node: ${process.versions.node}, Chromium: ${process.versions.chrome}
  `);
});

app.on("before-quit", () => {
  isQuitting = true;
  try {
    void disconnectRPC();
  } catch {
    // ignore
  }
});

app.on("will-quit", () => {
  logger.info("Closing Butter Launcher");
});

export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayUnavailable = false;
let isQuitting = false;
let backgroundTimeout: NodeJS.Timeout | null = null;
let isBackgroundMode = false;
let networkBlockerInstalled = false;
let isGameRunning = false;

const destroyTray = () => {
  if (!tray) return;
  try {
    tray.destroy();
  } catch (err) {
    logger.error("An error occurred while destroying tray", err);
  }
  tray = null;
};

const installBackgroundNetworkBlocker = (w: BrowserWindow) => {
  if (networkBlockerInstalled) return;
  networkBlockerInstalled = true;

  const ses = w.webContents.session;
  ses.webRequest.onBeforeRequest((details, callback) => {
    // In dev, blocking network breaks Vite HMR and local debugging.
    if (VITE_DEV_SERVER_URL) return callback({ cancel: false });

    if (!isBackgroundMode) return callback({ cancel: false });

    const url = details.url || "";
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return callback({ cancel: true });
    }

    return callback({ cancel: false });
  });
};

function resolveAppIcon() {
  const iconFile = path.join(
    process.env.APP_ROOT,
    "build",
    process.platform === "win32" ? "icon.ico" : "icon.png",
  );

  return nativeImage.createFromPath(iconFile);
}

const restoreFromBackground = () => {
  if (!win) return;

  isBackgroundMode = false;

  try {
    if (win.isMinimized()) win.restore();
  } catch {
    // ignore
  }

  win.webContents.setBackgroundThrottling(false);
  win.setSkipTaskbar(false);
  win.show();
  win.focus();

  // Keep current presence; if no game is running it will be "Choosing Version".
};

const ensureTray = () => {
  if (tray) return tray;
  if (trayUnavailable) return null;

  const icon = resolveAppIcon();
  // Tray requires an image; if missing, create a transparent placeholder.
  const trayIcon = icon ?? nativeImage.createEmpty();

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip("Butter Launcher");
  } catch (e) {
    trayUnavailable = true;
    tray = null;
    console.warn("Tray not available on this system:", e);
    return null;
  }

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Butter Launcher",
      click: () => restoreFromBackground(),
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => restoreFromBackground());

  return tray;
};

const moveToBackground = () => {
  if (!win) return;

  isBackgroundMode = true;

  const t = ensureTray();
  if (t) {
    // Preferred: tray mode (Windows “hidden icons”, Linux tray when available)
    win.setSkipTaskbar(true);
    win.hide();
  } else {
    // Fallback: no tray available (common on GNOME without AppIndicator)
    // Keep the app accessible from the taskbar.
    win.setSkipTaskbar(false);
    win.minimize();
  }

  // Reduce renderer work while hidden (CPU/network timers get throttled).
  win.webContents.setBackgroundThrottling(true);

  // Best-effort: ensure app updater is not downloading anything in the background.
  try {
    autoUpdater.autoDownload = false;
    // @ts-expect-error: electron-updater types vary; method exists in supported versions.
    autoUpdater.cancelDownload?.();
  } catch {
    // ignore
  }

  // Reduce background chatter (best-effort).
  // Note: keep Discord Rich Presence active while in tray/background.
};

function createWindow() {
  const icon = resolveAppIcon();

  win = new BrowserWindow({
    width: 1026,
    height: 640,
    frame: false,
    titleBarStyle: "hidden",
    resizable: false,
    backgroundColor: "#00000000",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  installBackgroundNetworkBlocker(win);

  // Close behavior:
  // - If Hytale is running, close should move the launcher to background/tray.
  // - If no Hytale client is running, close should actually quit the launcher.
  win.on("close", (e) => {
    if (isQuitting) return;

    if (isGameRunning) {
      e.preventDefault();
      moveToBackground();
      return;
    }

    // Ensure macOS quits as well (default behavior is to keep the app running).
    if (process.platform === "darwin") {
      isQuitting = true;
      app.quit();
    }
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

ipcMain.on("ready", (_, { enableRPC }) => {
  if (enableRPC) {
    connectRPC();
    try {
      setChoosingVersionActivity();
    } catch {
      // ignore
    }
  }
});
ipcMain.on("rpc:enable", (_, enable) => {
  if (enable) {
    connectRPC();
    try {
      setChoosingVersionActivity();
    } catch {
      // ignore
    }
  } else {
    disconnectRPC();
  }
});

ipcMain.handle(
  "online-patch:check",
  async (_, gameDir: string, version: GameVersion) => {
    return await checkOnlinePatchNeeded(gameDir, version);
  },
);

ipcMain.handle(
  "online-patch:state",
  async (_, gameDir: string, version: GameVersion) => {
    return getOnlinePatchState(gameDir, version);
  },
);

ipcMain.handle(
  "online-patch:health",
  async (_, gameDir: string, version: GameVersion) => {
    return await getOnlinePatchHealth(gameDir, version);
  },
);

ipcMain.handle("fetch:json", async (_, url, ...args) => {
  const response = await fetch(url, ...args);
  return await response.json();
});
ipcMain.handle("fetch:head", async (_, url, ...args) => {
  const response = await fetch(url, ...args);
  return response.status;
});

ipcMain.handle("get-default-game-directory", () => {
  try {
    if (process.platform === "linux") {
      const xdgBase =
        process.env["XDG_DATA_HOME"] &&
        path.isAbsolute(process.env["XDG_DATA_HOME"]!)
          ? process.env["XDG_DATA_HOME"]!
          : path.join(os.homedir(), ".local", "share");
      const newPath = path.join(xdgBase, "butter-launcher", "Hytale");
      const legacyPath = path.join(META_DIRECTORY, "Hytale");
      if (fs.existsSync(legacyPath) && !fs.existsSync(newPath))
        return legacyPath;
      return newPath;
    }
  } catch {}
  return path.join(META_DIRECTORY, "Hytale");
});

ipcMain.handle("open-folder", async (_, folderPath: string) => {
  try {
    if (typeof folderPath !== "string" || !folderPath) {
      throw new Error("Invalid folder path");
    }

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    const result = await shell.openPath(folderPath);
    // shell.openPath returns an empty string on success, otherwise an error message.
    return { ok: result === "", error: result || null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("open-external", async (_, url: string) => {
  try {
    if (typeof url !== "string" || !url) {
      throw new Error("Invalid url");
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Only https links are allowed");
    }

    const hostname = parsed.hostname.toLowerCase();
    const allowedHosts = new Set([
      "discord.com",
      "www.discord.com",
      "discord.gg",
      "www.discord.gg",
    ]);
    if (!allowedHosts.has(hostname)) {
      throw new Error("Blocked external link");
    }

    await shell.openExternal(parsed.toString());
    return { ok: true, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle(
  "check-game-installation",
  (_, baseDir: string, version: GameVersion) => {
    return checkGameInstallation(baseDir, version);
  },
);

ipcMain.handle(
  "get-installed-build",
  (_, baseDir: string, versionType: GameVersion["type"]) => {
    try {
      migrateLegacyChannelInstallIfNeeded(baseDir, versionType);

      if (versionType === "release") {
        const latestDir = getLatestDir(baseDir);
        const latest = readInstallManifest(latestDir);
        if (latest?.build_index) return latest.build_index;
      }

      const channelDir =
        versionType === "release"
          ? getReleaseChannelDir(baseDir)
          : getPreReleaseChannelDir(baseDir);
      if (!fs.existsSync(channelDir)) return null;

      const builds = fs
        .readdirSync(channelDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^build-\d+$/.test(d.name))
        .map((d) => Number(d.name.replace("build-", "")))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);

      if (!builds.length) return null;
      const idx = builds[builds.length - 1];
      const installDir =
        versionType === "release"
          ? getReleaseBuildDir(baseDir, idx)
          : getPreReleaseBuildDir(baseDir, idx);
      const manifest = readInstallManifest(installDir);
      return manifest?.build_index ?? idx;
    } catch {
      return null;
    }
  },
);

ipcMain.handle("list-installed-versions", (_, baseDir: string) => {
  return listInstalledVersions(baseDir);
});

ipcMain.handle(
  "delete-installed-version",
  (_, baseDir: string, info: InstalledBuildInfo) => {
    try {
      deleteInstalledVersion(baseDir, info);
      return { success: true };
    } catch (e) {
      logger.error("Failed to delete version", e);
      return { success: false, error: String(e) };
    }
  },
);

ipcMain.on("install-game", (e, gameDir: string, version: GameVersion) => {
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    installGame(gameDir, version, win);
  }
});

ipcMain.on(
  "launch-game",
  (
    e,
    gameDir: string,
    version: GameVersion,
    username: string,
    customUUID?: string | null,
  ) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      // Reset any pending background transition from a previous launch attempt.
      if (backgroundTimeout) {
        clearTimeout(backgroundTimeout);
        backgroundTimeout = null;
      }

      launchGame(gameDir, version, username, win, 0, customUUID ?? null, {
        onGameSpawned: () => {
          logger.info(`Game spawned: ${version.type} ${version.build_name}`);
          isGameRunning = true;
          try {
            setPlayingActivity(version);
          } catch {
            // ignore
          }

          // Give the user a few seconds to see the launcher state change,
          // then move to tray/background while the game is running.
          backgroundTimeout = setTimeout(() => {
            moveToBackground();
            backgroundTimeout = null;
          }, 3000);
        },
        onGameExited: () => {
          isGameRunning = false;
          if (backgroundTimeout) {
            clearTimeout(backgroundTimeout);
            backgroundTimeout = null;
          }
          restoreFromBackground();

          // If the game is no longer running, we don't need to keep a tray icon around.
          destroyTray();

          try {
            setChoosingVersionActivity();
          } catch {
            // ignore
          }
        },
      });
    }
  },
);

ipcMain.on(
  "online-patch:enable",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    try {
      const result = await enableOnlinePatch(
        gameDir,
        version,
        win,
        "online-patch-progress",
      );
      win.webContents.send("online-patch-finished", result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      win.webContents.send("online-patch-error", msg);
    }
  },
);

ipcMain.on(
  "online-patch:disable",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    try {
      const result = await disableOnlinePatch(
        gameDir,
        version,
        win,
        "online-unpatch-progress",
      );
      win.webContents.send("online-unpatch-finished", result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      win.webContents.send("online-unpatch-error", msg);
    }
  },
);

ipcMain.on(
  "online-patch:fix-client",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    try {
      const result = await fixClientToUnpatched(
        gameDir,
        version,
        win,
        "online-unpatch-progress",
      );
      win.webContents.send("online-unpatch-finished", result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      win.webContents.send("online-unpatch-error", msg);
    }
  },
);
