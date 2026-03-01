import fs from "node:fs";
import path from "node:path";

import { migrateLegacyChannelInstallIfNeeded, resolveExistingInstallDir } from "./paths";

// Steam Deck fix: because bundled libs and modern Linux have a complicated relationship.

export type SteamDeckFixResult = {
  ok: boolean;
  applied: boolean;
  restored: boolean;
  changedFiles: string[];
  message?: string;
  details?: Record<string, any>;
};

const getClientDir = (installDir: string) => path.join(installDir, "Client");

const getLibPaths = (installDir: string) => {
  const clientDir = getClientDir(installDir);
  const libPath = path.join(clientDir, "libzstd.so");
  const backupPath = path.join(clientDir, "libzstd.so.bundled");
  return { clientDir, libPath, backupPath };
};

const isSymlink = (p: string) => {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

const existsFile = (p: string) => {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
};

const findSystemLibzstd = (): string | null => {
  // Common locations on Steam Deck / Ubuntu / Debian derivatives.
  // Prefer the exact SONAME symlink so the game links correctly.
  const candidates = [
    "/usr/lib/libzstd.so.1",
    "/usr/lib64/libzstd.so.1",
    "/lib/libzstd.so.1",
    "/lib64/libzstd.so.1",
    "/usr/lib/x86_64-linux-gnu/libzstd.so.1",
    "/lib/x86_64-linux-gnu/libzstd.so.1",
    "/usr/lib/aarch64-linux-gnu/libzstd.so.1",
    "/lib/aarch64-linux-gnu/libzstd.so.1",
  ];

  for (const p of candidates) {
    if (existsFile(p)) return p;
  }
  return null;
};

export const applySteamDeckLibzstdFixToInstallDir = (
  installDir: string,
): SteamDeckFixResult => {
  if (process.platform !== "linux") {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "SteamDeck mode is only supported on Linux.",
    };
  }

  const { clientDir, libPath, backupPath } = getLibPaths(installDir);

  if (!existsFile(clientDir)) {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "Client directory not found.",
      details: { clientDir },
    };
  }

  const systemLib = findSystemLibzstd();
  if (!systemLib) {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "System libzstd.so.1 not found in common locations.",
    };
  }

  const changed: string[] = [];

  // If already symlinked, nothing to do.
  if (existsFile(libPath) && isSymlink(libPath)) {
    return {
      ok: true,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "libzstd.so is already a symlink.",
      details: { libPath, systemLib },
    };
  }

  // Backup bundled file if present and backup doesn't exist.
  if (existsFile(libPath) && !existsFile(backupPath)) {
    try {
      fs.renameSync(libPath, backupPath);
      changed.push(backupPath);
    } catch (e) {
      return {
        ok: false,
        applied: false,
        restored: false,
        changedFiles: changed,
        message: "Failed to backup bundled libzstd.so.",
        details: { error: e instanceof Error ? e.message : String(e) },
      };
    }
  }

  // Remove any remaining libzstd.so file if it exists (non-symlink).
  try {
    if (existsFile(libPath)) {
      fs.rmSync(libPath, { force: true });
    }
  } catch {
    // ignore best-effort
  }

  // Create symlink.
  try {
    fs.symlinkSync(systemLib, libPath);
    changed.push(libPath);
  } catch (e) {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: changed,
      message: "Failed to create libzstd.so symlink.",
      details: { libPath, systemLib, error: e instanceof Error ? e.message : String(e) },
    };
  }

  return {
    ok: true,
    applied: true,
    restored: false,
    changedFiles: changed,
    message: "SteamDeck libzstd fix applied.",
    details: { libPath, backupPath, systemLib },
  };
};

export const restoreSteamDeckLibzstdFixToInstallDir = (
  installDir: string,
): SteamDeckFixResult => {
  if (process.platform !== "linux") {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "SteamDeck mode is only supported on Linux.",
    };
  }

  const { clientDir, libPath, backupPath } = getLibPaths(installDir);
  if (!existsFile(clientDir)) {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "Client directory not found.",
      details: { clientDir },
    };
  }

  const changed: string[] = [];

  // Remove symlink (or file) at libPath.
  try {
    if (existsFile(libPath)) {
      fs.rmSync(libPath, { force: true });
      changed.push(libPath);
    }
  } catch {
    // ignore
  }

  // Restore backup if present.
  if (existsFile(backupPath)) {
    try {
      fs.renameSync(backupPath, libPath);
      changed.push(libPath);
    } catch (e) {
      return {
        ok: false,
        applied: false,
        restored: false,
        changedFiles: changed,
        message: "Failed to restore bundled libzstd.so.",
        details: { error: e instanceof Error ? e.message : String(e) },
      };
    }

    return {
      ok: true,
      applied: false,
      restored: true,
      changedFiles: changed,
      message: "SteamDeck libzstd fix restored (bundled libzstd.so reinstated).",
      details: { libPath, backupPath },
    };
  }

  return {
    ok: true,
    applied: false,
    restored: false,
    changedFiles: changed,
    message: "No bundled backup found; nothing to restore.",
    details: { libPath, backupPath },
  };
};

export const applySteamDeckFixForVersion = (
  gameDir: string,
  version: GameVersion,
  enabled: boolean,
): SteamDeckFixResult => {
  try {
    migrateLegacyChannelInstallIfNeeded(gameDir, version.type);
    const installDir = resolveExistingInstallDir(gameDir, version);
    return enabled
      ? applySteamDeckLibzstdFixToInstallDir(installDir)
      : restoreSteamDeckLibzstdFixToInstallDir(installDir);
  } catch (e) {
    return {
      ok: false,
      applied: false,
      restored: false,
      changedFiles: [],
      message: "Failed to resolve install directory for SteamDeck fix.",
      details: { error: e instanceof Error ? e.message : String(e) },
    };
  }
};
