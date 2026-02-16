import { ipcRenderer, contextBridge } from "electron";
import { version, build_date } from "../package.json";

// Preload: carefully exposing just enough power to be dangerous.

const normalizeBuildDate = (raw: unknown): string => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s) return s;
  // beforeBuild normally writes this, but dev runs can skip it
  return `ButterLauncher_${new Date().toISOString().split("T")[0]}`;
};

// --------- Expose some API to the Renderer process ---------
// We wrap listeners to avoid exposing the raw event object.
// BUT: if we wrap, we must also be able to unwrap on off/removeListener.
const listenerRegistry = new Map<
  string,
  Map<(...args: any[]) => any, (...args: any[]) => any>
>();

const getWrappedListener = (
  channel: string,
  listener: (...args: any[]) => any,
): ((...args: any[]) => any) => {
  let channelMap = listenerRegistry.get(channel);
  if (!channelMap) {
    channelMap = new Map();
    listenerRegistry.set(channel, channelMap);
  }

  const existing = channelMap.get(listener);
  if (existing) return existing;

  const wrapped = (event: any, ...args: any[]) => listener(event, ...args);
  channelMap.set(listener, wrapped);
  return wrapped;
};

const dropWrappedListener = (
  channel: string,
  listener: (...args: any[]) => any,
): ((...args: any[]) => any) => {
  const channelMap = listenerRegistry.get(channel);
  const wrapped = channelMap?.get(listener);
  if (wrapped) {
    channelMap!.delete(listener);
    if (channelMap!.size === 0) listenerRegistry.delete(channel);
    return wrapped;
  }
  return listener;
};

contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    const wrapped = getWrappedListener(channel, listener as any);
    return ipcRenderer.on(channel, wrapped as any);
  },
  // `ipcRenderer.off` requires a listener, but callers in the renderer sometimes
  // want to remove all listeners for a channel. Support both.
  off(channel: string, listener?: (...args: any[]) => any) {
    if (typeof listener === "function") {
      const wrapped = dropWrappedListener(channel, listener as any);
      return ipcRenderer.off(channel, wrapped as any);
    }
    // If called with only the channel, forward as-is.
    listenerRegistry.delete(channel);
    return ipcRenderer.removeAllListeners(channel);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args;
    const wrapped = getWrappedListener(channel, listener as any);
    // Ensure we drop mapping after the first call.
    const wrappedOnce = (event: any, ...rest: any[]) => {
      try {
        (wrapped as any)(event, ...rest);
      } finally {
        dropWrappedListener(channel, listener as any);
      }
    };
    return ipcRenderer.once(channel, wrappedOnce as any);
  },
  removeListener(...args: Parameters<typeof ipcRenderer.removeListener>) {
    const [channel, listener] = args;
    const wrapped = dropWrappedListener(channel, listener as any);
    return ipcRenderer.removeListener(channel, wrapped as any);
  },
});

contextBridge.exposeInMainWorld("config", {
  getDefaultGameDirectory: () =>
    ipcRenderer.invoke("get-default-game-directory"),
  getDownloadDirectory: () => ipcRenderer.invoke("download-directory:get"),
  selectDownloadDirectory: () => ipcRenderer.invoke("download-directory:select"),
  pickFolder: (payload?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke("dialog:pick-folder", payload ?? {}),
  pickFile: (payload?: { title?: string; defaultPath?: string; extensions?: string[] }) =>
    ipcRenderer.invoke("dialog:pick-file", payload ?? {}),
  getSteamDeckMode: () => ipcRenderer.invoke("steamdeck-mode:get"),
  setSteamDeckMode: (enabled: boolean, gameDir?: string | null) =>
    ipcRenderer.invoke("steamdeck-mode:set", enabled, gameDir ?? null),
  openFolder: (folderPath: string) =>
    ipcRenderer.invoke("open-folder", folderPath),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),

  supportTicketCollect: (username: string, customUUID?: string | null) =>
    ipcRenderer.invoke("support-ticket:collect", username, customUUID ?? null),

  startupSoundGet: () => ipcRenderer.invoke("launcher-settings:startup-sound:get"),
  startupSoundSet: (enabled: boolean) =>
    ipcRenderer.invoke("launcher-settings:startup-sound:set", !!enabled),
  startupSoundMarkFirstRunPlayed: () =>
    ipcRenderer.invoke("launcher-settings:startup-sound:first-run-played"),

  // Premium login (OAuth)
  premiumStatus: () => ipcRenderer.invoke("premium:status"),
  premiumOauthStart: () => ipcRenderer.invoke("premium:oauth:start"),
  premiumOauthCancel: () => ipcRenderer.invoke("premium:oauth:cancel"),
  premiumLogout: () => ipcRenderer.invoke("premium:logout"),

  // Host server (local)
  hostServerStart: (
    gameDir: string,
    version: GameVersion,
    opts?: {
      assetsZipPath?: string | null;
      authMode?: "offline" | "authenticated" | "insecure";
      noAot?: boolean;
      ramMinGb?: number | null;
      ramMaxGb?: number | null;
    },
  ) => ipcRenderer.invoke("host-server:start", gameDir, version, opts ?? {}),
  hostServerStop: () => ipcRenderer.invoke("host-server:stop"),
  hostServerCommand: (command: string) =>
    ipcRenderer.invoke("host-server:command", command),
  hostServerSyncFolder: (
    gameDir: string,
    version: GameVersion,
    kind: "universe" | "mods" | "earlyplugins",
    sourceDir: string,
  ) => ipcRenderer.invoke("host-server:sync-folder", gameDir, version, kind, sourceDir),

  // Mods (CurseForge + local installed)
  modsSearch: (query?: string) => ipcRenderer.invoke("mods:search", query ?? ""),
  modsBrowse: (payload?: { query?: string; sort?: string; index?: number; pageSize?: number }) =>
    ipcRenderer.invoke("mods:browse", payload ?? {}),
  modsGetDescription: (modId: number) => ipcRenderer.invoke("mods:description", modId),
  modsGetDetails: (modId: number) => ipcRenderer.invoke("mods:details", modId),
  modsInstall: (modId: number, gameDir: string) => ipcRenderer.invoke("mods:install", modId, gameDir),
  modsInstallFile: (modId: number, fileId: number, gameDir: string) =>
    ipcRenderer.invoke("mods:install-file", modId, fileId, gameDir),
  modsRegistry: (gameDir: string) => ipcRenderer.invoke("mods:registry", gameDir),
  modsInstalledList: (gameDir: string) => ipcRenderer.invoke("mods:installed:list", gameDir),
  modsInstalledToggle: (gameDir: string, fileName: string) =>
    ipcRenderer.invoke("mods:installed:toggle", gameDir, fileName),
  modsInstalledDelete: (gameDir: string, fileName: string) =>
    ipcRenderer.invoke("mods:installed:delete", gameDir, fileName),
  modsFileHash: (gameDir: string, fileName: string) =>
    ipcRenderer.invoke("mods:file-hash", gameDir, fileName),
  modsInstalledSetAll: (gameDir: string, enabled: boolean) =>
    // Because clicking 200 toggles manually builds character.
    ipcRenderer.invoke("mods:installed:set-all", gameDir, enabled),

  modsProfilesList: (gameDir: string) => ipcRenderer.invoke("mods:profiles:list", gameDir),
  // We smuggle optional version pinning (cf) through IPC, because users delete things.
  modsProfilesSave: (
    gameDir: string,
    profile: { name: string; mods: string[]; cf?: Record<string, { modId: number; fileId?: number }> },
  ) =>
    ipcRenderer.invoke("mods:profiles:save", gameDir, profile),
  modsProfilesDelete: (gameDir: string, name: string) =>
    ipcRenderer.invoke("mods:profiles:delete", gameDir, name),
  modsProfilesApply: (gameDir: string, name: string) =>
    ipcRenderer.invoke("mods:profiles:apply", gameDir, name),

  OS: process.platform,
  ARCH: process.arch,
  VERSION: version,
  BUILD_DATE: normalizeBuildDate(build_date),
});
