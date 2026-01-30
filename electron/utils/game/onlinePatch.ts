/**
 * Online Patch Module - Now uses local binary patching (method by Sanasol)
 * 
 * The old CDN-based pre-patched binary system has been replaced with
 * local binary patching that modifies the game executables directly.
 */

import { BrowserWindow } from "electron";
import {
  ensureClientPatched,
  restoreOriginals,
  getPatchState,
  patchGameWithProgress,
} from "./binaryPatcher";
import type { GameVersion } from "./types";
import { URL } from "url";

function getDomain(authServerUrl?: string | null): string | undefined {
    if (authServerUrl) {
        try {
            return new URL(authServerUrl).hostname;
        } catch {
            return authServerUrl;
        }
    }
    return undefined;
}

// Re-export the new patcher functions with compatible names

export const getOnlinePatchState = (
  gameDir: string,
  version: GameVersion,
  authServerUrl?: string | null,
): {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  downloaded: boolean;
} => {
  const state = getPatchState(gameDir, version, getDomain(authServerUrl));
  
  return {
    supported: true, // Always supported with local patching
    available: true, // Always available with local patching
    enabled: state.clientPatched || state.serverPatched,
    downloaded: true, // No download needed for local patching
  };
};

export const getOnlinePatchHealth = async (
  gameDir: string,
  version: GameVersion,
  authServerUrl?: string | null,
): Promise<{
  supported: boolean;
  available: boolean;
  enabled: boolean;
  clientIsPatched: boolean;
  serverIsPatched: boolean;
  needsFixClient: boolean;
  needsFixServer: boolean;
  needsFix: boolean;
  patchOutdated: boolean;
}> => {
  const state = getPatchState(gameDir, version, getDomain(authServerUrl));
  
  return {
    supported: true, // Always supported
    available: true, // Always available
    enabled: state.clientPatched || state.serverPatched,
    clientIsPatched: state.clientPatched,
    serverIsPatched: state.serverPatched,
    needsFixClient: false,
    needsFixServer: false,
    needsFix: false,
    patchOutdated: false,
  };
};

export const enableOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress" = "online-patch-progress",
  authServerUrl?: string | null,
): Promise<"enabled" | "already-enabled" | "skipped"> => {
  const domain = getDomain(authServerUrl);
  const state = getPatchState(gameDir, version, domain);
  
  if (!state.supported) return "skipped";
  
  if (state.clientPatched && state.serverPatched) {
    return "already-enabled";
  }

  const progressCallback = (message: string, percent: number | null) => {
    win.webContents.send(progressChannel, {
      phase: "online-patch",
      message,
      percent: percent ?? -1,
    });
  };

  const result = await ensureClientPatched(gameDir, version, progressCallback, domain);
  
  if (result.success) {
    win.webContents.send(progressChannel, {
      phase: "online-patch",
      percent: 100,
    });
    return "enabled";
  }
  
  return "skipped";
};

export const disableOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
  authServerUrl?: string | null,
): Promise<"disabled" | "already-disabled" | "skipped"> => {
  const domain = getDomain(authServerUrl);
  const state = getPatchState(gameDir, version, domain);
  
  if (!state.supported) return "skipped";
  
  if (!state.clientPatched && !state.serverPatched) {
    return "already-disabled";
  }

  const progressCallback = (message: string, percent: number | null) => {
    win.webContents.send(progressChannel, {
      phase: "online-unpatch",
      message,
      percent: percent ?? -1,
    });
  };

  const result = await restoreOriginals(gameDir, version, progressCallback);
  
  if (result.success) {
    win.webContents.send(progressChannel, {
      phase: "online-unpatch",
      percent: 100,
    });
    return "disabled";
  }
  
  return "skipped";
};

export const checkOnlinePatchNeeded = async (
  gameDir: string,
  version: GameVersion,
  authServerUrl?: string | null,
): Promise<"needs" | "up-to-date" | "skipped"> => {
  const state = getPatchState(gameDir, version, getDomain(authServerUrl));
  
  if (!state.supported) return "skipped";
  
  if (state.clientPatched) {
    return "up-to-date";
  }
  
  return "needs";
};

export const fixOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress" = "online-patch-progress",
  authServerUrl?: string | null,
): Promise<"fixed" | "not-needed" | "skipped"> => {
  const domain = getDomain(authServerUrl);
  const state = getPatchState(gameDir, version, domain);
  
  if (!state.supported) return "skipped";
  
  // If already properly patched, nothing to fix
  if (state.clientPatched) {
    return "not-needed";
  }
  
  // Re-patch
  const progressCallback = (message: string, percent: number | null) => {
    win.webContents.send(progressChannel, {
      phase: "online-patch",
      message,
      percent: percent ?? -1,
    });
  };

  const result = await ensureClientPatched(gameDir, version, progressCallback, domain);
  
  return result.success ? "fixed" : "skipped";
};

// Legacy exports for backwards compatibility
export const getClientPatchState = getOnlinePatchState;
export const getClientPatchHealth = getOnlinePatchHealth;
export const enableClientPatch = enableOnlinePatch;
export const disableClientPatch = disableOnlinePatch;
export const checkClientPatchNeeded = checkOnlinePatchNeeded;
export const fixClientToUnpatched = fixOnlinePatch;

// Server patch functions now just delegate to the unified functions
export const getServerPatchState = getOnlinePatchState;
export const getServerPatchHealth = getOnlinePatchHealth;
export const enableServerPatch = enableOnlinePatch;
export const disableServerPatch = disableOnlinePatch;
export const checkServerPatchNeeded = checkOnlinePatchNeeded;
export const fixServerToUnpatched = fixOnlinePatch;
