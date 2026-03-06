import type { BrowserWindow } from "electron";

import { customOnlinePatchProvider } from "../dynamicModules/customOnlinePatchProvider";
import { formatErrorWithHints } from "../errorHints";

const extractUrlMeta = (rawUrl?: string) => {
  if (!rawUrl) return undefined;
  try {
    const u = new URL(rawUrl);
    const host = u.hostname;
    const tsRaw = u.searchParams.get("timestamp");
    const ts = tsRaw ? Number(tsRaw) : NaN;
    const timestampMs = Number.isFinite(ts) && ts > 0 ? ts : undefined;
    return { host, timestampMs, nowMs: Date.now() };
  } catch {
    return undefined;
  }
};

const wrapOnlinePatchError = (
  err: unknown,
  op: string,
  version: GameVersion,
): never => {
  const statusMatch =
    typeof (err as any)?.message === "string"
      ? (err as any).message.match(/\((\d{3})\)/)
      : null;
  const status = statusMatch ? Number(statusMatch[1]) : undefined;

  const urlMeta = extractUrlMeta(version.patch_url || version.original_url);

  const { userMessage } = formatErrorWithHints(err, {
    op,
    status: Number.isFinite(status as any) ? status : undefined,
    url: undefined,
    urlMeta,
  });

  const wrapped = new Error(userMessage);
  (wrapped as any).cause = err;
  throw wrapped;
};

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
  try {
    return await customOnlinePatchProvider.enableClientPatch(
      gameDir,
      version,
      win,
      progressChannel,
      aggregate,
    );
  } catch (e) {
    return wrapOnlinePatchError(e, "Enable client patch", version);
  }
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
  try {
    return await customOnlinePatchProvider.enableServerPatch(
      gameDir,
      version,
      win,
      progressChannel,
      aggregate,
    );
  } catch (e) {
    return wrapOnlinePatchError(e, "Enable server patch", version);
  }
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
  try {
    return await customOnlinePatchProvider.enableOnlinePatch(
      gameDir,
      version,
      win,
      progressChannel,
    );
  } catch (e) {
    return wrapOnlinePatchError(e, "Enable online patch", version);
  }
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
  try {
    return await customOnlinePatchProvider.fixOnlinePatch(
      gameDir,
      version,
      win,
      progressChannel,
    );
  } catch (e) {
    return wrapOnlinePatchError(e, "Fix online patch", version);
  }
};

export const reconcileOfflineServerJwksPatchForLaunch = async (
  gameDir: string,
  version: GameVersion,
  desired: "original" | "online" | "offline",
  win?: BrowserWindow,
  progressChannel: "online-patch-progress" = "online-patch-progress",
  opts?: { force?: boolean; buildOnly?: boolean },
): Promise<"noop" | "applied" | "restored" | "skipped"> => {
  try {
    return await customOnlinePatchProvider.reconcileOfflineServerJwksPatchForLaunch(
      gameDir,
      version,
      {
        desired,
        ...(opts && typeof opts === "object" ? { force: !!opts.force, buildOnly: !!opts.buildOnly } : {}),
        progress: win ? { win, progressChannel } : undefined,
      },
    );
  } catch {
    return "skipped";
  }
};
