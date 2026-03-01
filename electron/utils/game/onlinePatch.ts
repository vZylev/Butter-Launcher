import type { BrowserWindow } from "electron";

import { customOnlinePatchProvider } from "../dynamicModules/customOnlinePatchProvider";

export const getClientPatchState = (gameDir: string, version: GameVersion) => {
  return customOnlinePatchProvider.getClientPatchState(gameDir, version);
};

export const getClientPatchHealth = async (
  gameDir: string,
  version: GameVersion,
) => {
  return await customOnlinePatchProvider.getClientPatchHealth(gameDir, version);
};

export const fixClientToUnpatched = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "install-progress" | "online-unpatch-progress" =
    "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.fixClientToUnpatched(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const enableClientPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "install-progress" | "online-patch-progress" =
    "online-patch-progress",
  aggregate?: { total?: number; current: number },
) => {
  return await customOnlinePatchProvider.enableClientPatch(
    gameDir,
    version,
    win,
    progressChannel,
    aggregate,
  );
};

export const disableClientPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.disableClientPatch(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const checkClientPatchNeeded = async (
  gameDir: string,
  version: GameVersion,
) => {
  return await customOnlinePatchProvider.checkClientPatchNeeded(gameDir, version);
};

export const getServerPatchState = (gameDir: string, version: GameVersion) => {
  return customOnlinePatchProvider.getServerPatchState(gameDir, version);
};

export const getServerPatchHealth = async (
  gameDir: string,
  version: GameVersion,
) => {
  return await customOnlinePatchProvider.getServerPatchHealth(gameDir, version);
};

export const fixServerToUnpatched = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.fixServerToUnpatched(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const enableServerPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "install-progress" | "online-patch-progress" =
    "online-patch-progress",
  aggregate?: { total?: number; current: number },
) => {
  return await customOnlinePatchProvider.enableServerPatch(
    gameDir,
    version,
    win,
    progressChannel,
    aggregate,
  );
};

export const disableServerPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.disableServerPatch(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const checkServerPatchNeeded = async (
  gameDir: string,
  version: GameVersion,
) => {
  return await customOnlinePatchProvider.checkServerPatchNeeded(gameDir, version);
};

export const enableOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress" = "online-patch-progress",
) => {
  return await customOnlinePatchProvider.enableOnlinePatch(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const disableOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.disableOnlinePatch(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const removeOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.removeOnlinePatch(
    gameDir,
    version,
    win,
    progressChannel,
  );
};

export const getOnlinePatchState = (gameDir: string, version: GameVersion) => {
  return customOnlinePatchProvider.getOnlinePatchState(gameDir, version);
};

export const getOnlinePatchHealth = async (
  gameDir: string,
  version: GameVersion,
) => {
  return await customOnlinePatchProvider.getOnlinePatchHealth(gameDir, version);
};

export const checkOnlinePatchNeeded = async (
  gameDir: string,
  version: GameVersion,
) => {
  return await customOnlinePatchProvider.checkOnlinePatchNeeded(gameDir, version);
};

export const fixOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
) => {
  return await customOnlinePatchProvider.fixOnlinePatch(
    gameDir,
    version,
    win,
    progressChannel,
  );
};
