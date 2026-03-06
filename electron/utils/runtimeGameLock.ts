import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { META_DIRECTORY } from "./const";

export type RuntimeAccountType = "premium" | "custom";

type RuntimeGameEntry = {
  pid: number;
  startedAt: number;
  build?: {
    type?: string;
    build_index?: number;
    build_name?: string;
  };
};

export type RuntimeGameLockFile = {
  version: 1;
  accountType: RuntimeAccountType;
  games: RuntimeGameEntry[];
  updatedAt: number;
  // Epoch ms of the current OS boot time. Used to detect stale locks after a reboot.
  bootTime?: number;
};

const LOCK_FILENAME = "runtime-game-lock.json";
const LOCK_PATH = path.join(META_DIRECTORY, LOCK_FILENAME);

const getBootTimeEpochMs = () => {
  // uptime is seconds since boot; Date.now is epoch ms.
  const uptimeSec = os.uptime();
  if (!Number.isFinite(uptimeSec) || uptimeSec <= 0) return null;
  return Date.now() - uptimeSec * 1000;
};

const ensureMetaDir = () => {
  try {
    if (!fs.existsSync(META_DIRECTORY)) fs.mkdirSync(META_DIRECTORY, { recursive: true });
  } catch {
    // ignore
  }
};

const isPidRunning = (pid: number): boolean => {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    // signal 0 checks existence without killing.
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const safeReadLockFile = (): RuntimeGameLockFile | null => {
  try {
    if (!fs.existsSync(LOCK_PATH)) return null;
    const raw = fs.readFileSync(LOCK_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if ((parsed as any).version !== 1) return null;
    const accountType = (parsed as any).accountType;
    if (accountType !== "premium" && accountType !== "custom") return null;
    const gamesRaw = (parsed as any).games;
    const games = Array.isArray(gamesRaw) ? gamesRaw : [];

    const normalizedGames: RuntimeGameEntry[] = games
      .map((g: any) => {
        const pid = typeof g?.pid === "number" ? g.pid : NaN;
        const startedAt = typeof g?.startedAt === "number" ? g.startedAt : NaN;
        if (!Number.isFinite(pid) || pid <= 0) return null;
        const st = Number.isFinite(startedAt) ? startedAt : Date.now();
        const build = g?.build && typeof g.build === "object" ? g.build : undefined;
        return { pid, startedAt: st, ...(build ? { build } : {}) } as RuntimeGameEntry;
      })
      .filter(Boolean) as RuntimeGameEntry[];

    return {
      version: 1,
      accountType,
      games: normalizedGames,
      updatedAt: typeof (parsed as any).updatedAt === "number" ? (parsed as any).updatedAt : Date.now(),
      bootTime: typeof (parsed as any).bootTime === "number" ? (parsed as any).bootTime : undefined,
    };
  } catch {
    return null;
  }
};

const writeLockFileAtomic = (lock: RuntimeGameLockFile) => {
  try {
    ensureMetaDir();
    const tmp = `${LOCK_PATH}.tmp_${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(lock, null, 2), "utf8");
    fs.renameSync(tmp, LOCK_PATH);
  } catch {
    // ignore
  }
};

const removeLockFileBestEffort = () => {
  try {
    if (fs.existsSync(LOCK_PATH)) fs.unlinkSync(LOCK_PATH);
  } catch {
    // ignore
  }
};

export const getActiveRuntimeGameLock = (): RuntimeGameLockFile | null => {
  const cur = safeReadLockFile();
  if (!cur) return null;

  // If the machine rebooted since the lock was written, the lock is stale.
  // This avoids false positives due to PID reuse after power loss/crash.
  const nowBoot = getBootTimeEpochMs();
  if (typeof cur.bootTime === "number" && typeof nowBoot === "number") {
    const driftMs = Math.abs(nowBoot - cur.bootTime);
    // 5 minutes tolerance for clock adjustments.
    if (driftMs > 5 * 60 * 1000) {
      removeLockFileBestEffort();
      return null;
    }
  }

  const alive = cur.games.filter((g) => isPidRunning(g.pid));
  if (!alive.length) {
    removeLockFileBestEffort();
    return null;
  }

  if (alive.length !== cur.games.length) {
    const bootTime = nowBoot ?? cur.bootTime;
    const next: RuntimeGameLockFile = {
      ...cur,
      games: alive,
      updatedAt: Date.now(),
      ...(typeof bootTime === "number" ? { bootTime } : {}),
    };
    writeLockFileAtomic(next);
    return next;
  }

  // Backfill bootTime for older lock files.
  if (typeof cur.bootTime !== "number" && typeof nowBoot === "number") {
    const next: RuntimeGameLockFile = {
      ...cur,
      bootTime: nowBoot,
      updatedAt: Date.now(),
    };
    writeLockFileAtomic(next);
    return next;
  }

  return cur;
};

export const addRuntimeGameProcess = (opts: {
  accountType: RuntimeAccountType;
  pid: number;
  build?: { type?: string; build_index?: number; build_name?: string };
}): { ok: true; lock: RuntimeGameLockFile } | { ok: false; reason: "TYPE_MISMATCH"; lock: RuntimeGameLockFile } => {
  const existing = getActiveRuntimeGameLock();
  const bootTime = getBootTimeEpochMs();
  const entry: RuntimeGameEntry = {
    pid: opts.pid,
    startedAt: Date.now(),
    ...(opts.build ? { build: opts.build } : {}),
  };

  if (existing) {
    if (existing.accountType !== opts.accountType) {
      return { ok: false, reason: "TYPE_MISMATCH", lock: existing };
    }

    const dedup = existing.games.some((g) => g.pid === opts.pid);
    const next: RuntimeGameLockFile = {
      version: 1,
      accountType: existing.accountType,
      games: dedup ? existing.games : [...existing.games, entry],
      updatedAt: Date.now(),
      ...(typeof bootTime === "number" ? { bootTime } : {}),
    };
    writeLockFileAtomic(next);
    return { ok: true, lock: next };
  }

  const next: RuntimeGameLockFile = {
    version: 1,
    accountType: opts.accountType,
    games: [entry],
    updatedAt: Date.now(),
    ...(typeof bootTime === "number" ? { bootTime } : {}),
  };
  writeLockFileAtomic(next);
  return { ok: true, lock: next };
};

export const removeRuntimeGameProcess = (pid: number) => {
  const cur = safeReadLockFile();
  if (!cur) return;

  const nextGames = cur.games.filter((g) => g.pid !== pid).filter((g) => isPidRunning(g.pid));
  if (!nextGames.length) {
    removeLockFileBestEffort();
    return;
  }

  const next: RuntimeGameLockFile = {
    version: 1,
    accountType: cur.accountType,
    games: nextGames,
    updatedAt: Date.now(),
    ...(typeof cur.bootTime === "number" ? { bootTime: cur.bootTime } : {}),
  };
  writeLockFileAtomic(next);
};

export const getRuntimeGameLockPathForDebug = () => LOCK_PATH;
