/**
 * GameService — all IPC calls related to game installation,
 * launching, patching, and version management.
 *
 * No React, no DOM, no state — just a thin async wrapper around
 * the Electron IPC bridge.
 */

import {
  IPC_INSTALL_GAME,
  IPC_INSTALL_GAME_SMART,
  IPC_CANCEL_BUILD_DOWNLOAD,
  IPC_LAUNCH_GAME,
  IPC_INSTALL_BUILD1_MANUAL,
  IPC_ONLINE_PATCH_ENABLE,
  IPC_ONLINE_PATCH_DISABLE,
  IPC_ONLINE_PATCH_FIX_CLIENT,
  IPC_ONLINE_PATCH_REMOVE,
  IPC_FETCH_HEAD,
  IPC_LIST_INSTALLED_VERSIONS,
  IPC_DELETE_INSTALLED_VERSION,
  IPC_ONLINE_PATCH_HEALTH,
  IPC_ONLINE_PATCH_STATE,
  IPC_HOST_SERVER_OPEN_FOLDER,
} from "../ipc/channels";
import { StorageService } from "./StorageService";

// ── Types ──────────────────────────────────────────────────────

export type InstalledVersionInfo = {
  type: VersionType;
  build_index: number;
  build_name?: string;
  isLatest?: boolean;
};

export type OnlinePatchHealth = {
  ok: boolean;
  needsFix?: boolean;
  outdated?: boolean;
  enabled?: boolean;
};

export type HostServerOptions = {
  authMode?: "offline" | "authenticated" | "insecure";
  ram?: { min?: string; max?: string };
  noAot?: boolean;
  customJvmArgs?: string;
  assets?: string;
  universe?: string;
  mods?: string;
  earlyPlugins?: string;
};

// ── Service ────────────────────────────────────────────────────

export const GameService = {
  // -- Install --

  installGame(gameDir: string, version: GameVersion): void {
    const accountType = StorageService.getAccountType();
    window.ipcRenderer.send(IPC_INSTALL_GAME, gameDir, version, accountType);
  },

  installGameSmart(
    gameDir: string,
    version: GameVersion,
    fromBuildIndex: number,
  ): void {
    const accountType = StorageService.getAccountType();
    window.ipcRenderer.send(
      IPC_INSTALL_GAME_SMART,
      gameDir,
      version,
      fromBuildIndex,
      accountType,
    );
  },

  cancelBuildDownload(gameDir: string, version: GameVersion): void {
    window.ipcRenderer.send(IPC_CANCEL_BUILD_DOWNLOAD, gameDir, version);
  },

  installBuild1Manual(
    gameDir: string,
    src: string,
    channel: VersionType,
  ): void {
    window.ipcRenderer.send(IPC_INSTALL_BUILD1_MANUAL, gameDir, src, channel);
  },

  // -- Launch --

  launchGame(
    gameDir: string,
    version: GameVersion,
    username: string,
    offlineMode: boolean,
  ): void {
    const customUUID = StorageService.getString("customUUID");
    const uuidArg = customUUID.length ? customUUID : null;
    const accountType = StorageService.getAccountType();
    window.ipcRenderer.send(
      IPC_LAUNCH_GAME,
      gameDir,
      version,
      username,
      uuidArg,
      offlineMode,
      accountType,
    );
  },

  // -- Online patch --

  enableOnlinePatch(gameDir: string, version: GameVersion): void {
    window.ipcRenderer.send(IPC_ONLINE_PATCH_ENABLE, gameDir, version);
  },

  disableOnlinePatch(gameDir: string, version: GameVersion): void {
    window.ipcRenderer.send(IPC_ONLINE_PATCH_DISABLE, gameDir, version);
  },

  fixOnlinePatchClient(gameDir: string, version: GameVersion): void {
    window.ipcRenderer.send(IPC_ONLINE_PATCH_FIX_CLIENT, gameDir, version);
  },

  removeOnlinePatch(gameDir: string, version: GameVersion): void {
    window.ipcRenderer.send(IPC_ONLINE_PATCH_REMOVE, gameDir, version);
  },

  async getOnlinePatchHealth(
    gameDir: string,
    version: GameVersion,
  ): Promise<OnlinePatchHealth> {
    return await window.ipcRenderer.invoke(
      IPC_ONLINE_PATCH_HEALTH,
      gameDir,
      version,
    );
  },

  async getOnlinePatchState(
    gameDir: string,
    version: GameVersion,
  ): Promise<any> {
    return await window.ipcRenderer.invoke(
      IPC_ONLINE_PATCH_STATE,
      gameDir,
      version,
    );
  },

  // -- Version management --

  async listInstalledVersions(gameDir: string): Promise<InstalledVersionInfo[]> {
    return await window.ipcRenderer.invoke(
      IPC_LIST_INSTALLED_VERSIONS,
      gameDir,
    );
  },

  async deleteInstalledVersion(
    gameDir: string,
    version: GameVersion,
  ): Promise<any> {
    return await window.ipcRenderer.invoke(
      IPC_DELETE_INSTALLED_VERSION,
      gameDir,
      version,
    );
  },

  // -- Host server --

  async startHostServer(
    gameDir: string,
    version: GameVersion,
    opts?: HostServerOptions,
  ): Promise<any> {
    return await window.config.hostServerStart(gameDir, version, opts);
  },

  async stopHostServer(): Promise<any> {
    return await window.config.hostServerStop();
  },

  async sendHostServerCommand(cmd: string): Promise<any> {
    return await window.config.hostServerCommand(cmd);
  },

  async syncHostServerFolder(
    gameDir: string,
    version: GameVersion,
    kind: "universe" | "mods" | "earlyplugins",
    sourceDir: string,
  ): Promise<any> {
    return await window.config.hostServerSyncFolder(
      gameDir,
      version,
      kind,
      sourceDir,
    );
  },

  async openHostServerFolder(
    gameDir: string,
    version: GameVersion,
  ): Promise<void> {
    await window.ipcRenderer.invoke(
      IPC_HOST_SERVER_OPEN_FOLDER,
      gameDir,
      version,
    );
  },

  // -- Connectivity --

  async checkConnectivity(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
    const url =
      (import.meta as any).env?.VITE_REQUEST_VERSIONS_DETAILS_URL ||
      (import.meta as any).env?.VITE_LAUNCHER_VERSION_URL ||
      "https://updates.butterlauncher.tech/version.json";
    try {
      const status = await window.ipcRenderer.invoke(IPC_FETCH_HEAD, url);
      return status === 200;
    } catch {
      return false;
    }
  },

  // -- Misc --

  async getDefaultGameDirectory(): Promise<string> {
    return await window.config.getDefaultGameDirectory();
  },

  async pickFolder(payload?: any): Promise<any> {
    return await window.config.pickFolder(payload as any);
  },

  async pickFile(payload?: any): Promise<any> {
    return await window.config.pickFile(payload as any);
  },

  async openFolder(path: string): Promise<void> {
    await window.config.openFolder(path);
  },

  async openExternal(url: string): Promise<void> {
    const u = String(url || "").trim();
    if (!/^https?:\/\//i.test(u)) return;
    try {
      const opener = (window as any)?.config?.openExternal;
      if (typeof opener === "function") {
        await opener(u);
        return;
      }
    } catch {
      // ignore
    }
    try {
      window.open(u, "_blank", "noopener,noreferrer");
    } catch {
      // ignore
    }
  },
};
