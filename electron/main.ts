import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeImage,
  Tray,
  Menu,
  dialog,
  session,
} from "electron";

// Main process: where we spawn processes and regrets.
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";
import { LOGS_DIRECTORY, META_DIRECTORY } from "./utils/const";
import { logger } from "./utils/logger";
import { ErrorCodes, mapErrorToCode } from "./utils/errorCodes";
import { genUUID } from "./utils/game/uuid";

import {
  cancelBuildDownload,
  installGame,
  installGameNoPremiumFull,
  installGameNoPremium,
  installGameSmart,
  installBuild1FromFolder,
} from "./utils/game/install";
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

import { applySteamDeckFixForVersion } from "./utils/game/steamDeck";

import {
  browseMods,
  getModDescriptionHtml,
  getModDetails,
  getModFiles,
  searchMods,
  downloadLatestModFile,
  downloadModFile,
} from "./utils/mods/curseforge";

import {
  getLatestDir,
  getPreReleaseBuildDir,
  getPreReleaseChannelDir,
  getReleaseBuildDir,
  getReleaseChannelDir,
  migrateLegacyChannelInstallIfNeeded,
} from "./utils/game/paths";
import { resolveExistingInstallDir } from "./utils/game/paths";
import {
  checkOnlinePatchNeeded,
  disableOnlinePatch,
  enableOnlinePatch,
  removeOnlinePatch,
  fixClientToUnpatched,
  getOnlinePatchHealth,
  getOnlinePatchState,
} from "./utils/game/onlinePatch";

import {
  readOrInitLauncherSettings,
  markFirstRunStartupSoundPlayed,
  setPlayStartupSound,
} from "./utils/launcherSettings";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set APP_ROOT early so dotenv can find .env even when process.cwd() is doing interpretive dance.
process.env.APP_ROOT = path.join(__dirname, "..");

// Load .env for local/dev runs. Packaged builds usually don't ship it, because simplicity is overrated.
dotenv.config({ path: path.join(process.env.APP_ROOT, ".env") });

// Optional local overrides (.env.local, gitignored). CI can also inject env vars if it feels generous.
dotenv.config({
  path: path.join(process.env.APP_ROOT, ".env.local"),
  override: true,
});

// Windows Chromium loves shouting about non-actionable stuff, so we mute it to preserve sanity.
try {
  if (process.platform === "win32") {
    app.commandLine.appendSwitch("disable-logging");
    app.commandLine.appendSwitch("log-level", "3");
  }
} catch {
  // ignore
}

type HostServerStartResult =
  | { ok: true; pid: number; serverDir: string; cmd: string; args: string[] }
  | { ok: false; error: { code: string; message: string; details?: any } };

let hostServerProc: ChildProcessWithoutNullStreams | null = null;
let hostServerOwnerWindowId: number | null = null;

const stopHostServerProcess = (reason: string) => {
  const proc = hostServerProc;
  if (!proc || proc.killed) return;

  const pid = proc.pid;

  // Clear refs early to avoid racey IPC work during shutdown.
  hostServerProc = null;
  hostServerOwnerWindowId = null;

  try {
    proc.kill();
  } catch {
    // ignore
  }

  if (process.platform === "win32" && typeof pid === "number" && pid > 0) {
    try {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        shell: false,
        stdio: "ignore",
      });
    } catch {
      // ignore
    }
  }

  try {
    logger.info("Host server stopped on shutdown", { reason, pid });
  } catch {
    // ignore
  }
};

const sendHostServerEvent = (
  win: BrowserWindow | null,
  channel: string,
  payload: any,
) => {
  try {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
      return;
    }
  } catch {
    // ignore
  }

  // Fallback: try to send to the recorded owner.
  try {
    if (hostServerOwnerWindowId) {
      const w = BrowserWindow.fromId(hostServerOwnerWindowId);
      if (w && !w.isDestroyed()) {
        w.webContents.send(channel, payload);
      }
    }
  } catch {
    // ignore
  }
};

const parseJavaMajorVersion = (raw: string): number | null => {
  const s = String(raw ?? "");
  if (!s.trim()) return null;

  // Common formats include:
  // - java version "25" / "25.0.1"
  // - openjdk version "25.0.1" ...
  // - openjdk 25 2025-...
  // - openjdk version "1.8.0_312" (legacy)

  // First preference: quoted version.
  const quoted = s.match(/\bversion\s+"([0-9]+)(?:\.[0-9]+)*([^"]*)"/i);
  if (quoted) {
    const n = Number(quoted[1]);
    if (Number.isFinite(n)) {
      if (n === 1) {
        const legacy = s.match(/\bversion\s+"1\.(\d+)/i);
        if (legacy) {
          const n2 = Number(legacy[1]);
          return Number.isFinite(n2) ? n2 : null;
        }
      }
      return n;
    }
  }

  // Fallback: unquoted 'openjdk 25'.
  const openjdk = s.match(/\bopenjdk\s+(\d{1,2})\b/i);
  if (openjdk) {
    const n = Number(openjdk[1]);
    return Number.isFinite(n) ? n : null;
  }

  // Fallback: first reasonable-looking major after the word java.
  const javaWord = s.match(/\bjava\b[^0-9]*(\d{1,2})\b/i);
  if (javaWord) {
    const n = Number(javaWord[1]);
    return Number.isFinite(n) ? n : null;
  }

  return null;
};


const collectJavaExecCandidates = (): string[] => {
  const out: string[] = [];

  const add = (p: string | null | undefined) => {
    const s = typeof p === "string" ? p.trim() : "";
    if (!s) return;
    if (out.includes(s)) return;
    out.push(s);
  };

  try {
    const javaHome = typeof process.env.JAVA_HOME === "string" ? process.env.JAVA_HOME.trim() : "";
    if (javaHome) {
      add(path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java"));
    }
  } catch {
    // ignore
  }

  // PATH lookup
  try {
    if (process.platform === "win32") {
      const r = spawnSync("where", ["java"], {
        windowsHide: true,
        shell: false,
        encoding: "utf8",
        timeout: 2000,
      });
      const lines = String(r.stdout ?? "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const l of lines) add(l);
    } else {
      const r = spawnSync("which", ["-a", "java"], {
        shell: false,
        encoding: "utf8",
        timeout: 2000,
      });
      const lines = String(r.stdout ?? "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const l of lines) add(l);
    }
  } catch {
    // ignore
  }

  if (process.platform === "win32") {
    // Common install locations (Adoptium + Oracle). Best-effort scan.
    const roots = [
      "C:\\Program Files\\Eclipse Adoptium",
      "C:\\Program Files (x86)\\Eclipse Adoptium",
      "C:\\Program Files\\Java",
      "C:\\Program Files (x86)\\Java",
    ];

    for (const root of roots) {
      try {
        if (!fs.existsSync(root)) continue;
        const entries = fs.readdirSync(root, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          // Most names look like: jdk-25.0.1+9, jdk-21.0.5+11, etc.
          add(path.join(root, e.name, "bin", "java.exe"));
        }
      } catch {
        // ignore
      }
    }
  }

  // Filter non-existent files, but keep bare "java" as last resort.
  const existing = out.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  // Prefer real installs over WindowsApps shims.
  const nonShims = existing.filter((p) => !/\\WindowsApps\\/i.test(p));
  return nonShims.length ? nonShims : existing;
};

const probeJavaVersion = (execPath: string): { ok: boolean; raw: string; major: number | null } => {
  try {
    const r = spawnSync(execPath, ["-version"], {
      windowsHide: true,
      shell: false,
      encoding: "utf8",
      timeout: 4000,
    });

    const raw = `${String(r.stdout ?? "")}${String(r.stderr ?? "")}`.trim();
    const major = parseJavaMajorVersion(raw);
    return { ok: true, raw, major };
  } catch (e) {
    return { ok: false, raw: String((e as any)?.message ?? e), major: null };
  }
};

const checkJava25 = async (): Promise<
  | { ok: true; major: number; raw: string; execPath: string }
  | { ok: false; code: "JAVA_NOT_FOUND" | "JAVA_TOO_OLD" | "JAVA_CHECK_FAILED"; raw?: string; major?: number; execPath?: string }
> => {
  const candidates = collectJavaExecCandidates();

  if (!candidates.length) {
    // Last resort: try PATH, but report not found if it fails.
    const probed = probeJavaVersion("java");
    if (!probed.ok) return { ok: false, code: "JAVA_NOT_FOUND" };
    if (!probed.major) return { ok: false, code: "JAVA_CHECK_FAILED", raw: probed.raw, execPath: "java" };
    if (probed.major < 25) return { ok: false, code: "JAVA_TOO_OLD", major: probed.major, raw: probed.raw, execPath: "java" };
    return { ok: true, major: probed.major, raw: probed.raw, execPath: "java" };
  }

  // Probe every candidate and pick the highest version.
  let best: { execPath: string; major: number; raw: string } | null = null;
  let bestAny: { execPath: string; major: number; raw: string } | null = null;
  let lastRaw = "";

  for (const execPath of candidates) {
    const r = probeJavaVersion(execPath);
    if (!r.ok) continue;
    lastRaw = r.raw;
    if (!r.major) continue;

    const entry = { execPath, major: r.major, raw: r.raw };
    if (!bestAny || entry.major > bestAny.major) bestAny = entry;
    if (entry.major >= 25 && (!best || entry.major > best.major)) best = entry;
  }

  if (best) return { ok: true, major: best.major, raw: best.raw, execPath: best.execPath };
  if (bestAny) return { ok: false, code: "JAVA_TOO_OLD", major: bestAny.major, raw: bestAny.raw, execPath: bestAny.execPath };

  return { ok: false, code: "JAVA_CHECK_FAILED", raw: lastRaw || "Unable to execute any discovered java.exe" };
};

type LauncherSettings = {
  downloadDirectory?: string;
  steamDeckMode?: boolean;
};

const SETTINGS_FILE = path.join(META_DIRECTORY, "launcher-settings.json");

type PremiumAuthRecord = {
  version: 1;
  obtainedAt: string;
  token: Record<string, any>;
  profile?: {
    displayName: string;
    sub?: string;
    username?: string;
    uuid?: string;
    owner?: string;
    eulaAcceptedAt?: string;
  };
};

const PREMIUM_AUTH_FILE = path.join(META_DIRECTORY, "premium-auth.json");

const readPremiumAuth = (): PremiumAuthRecord | null => {
  try {
    ensureMetaDir();
    if (!fs.existsSync(PREMIUM_AUTH_FILE)) return null;
    const raw = fs.readFileSync(PREMIUM_AUTH_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== 1) return null;
    if (!parsed.token || typeof parsed.token !== "object") return null;
    return parsed as PremiumAuthRecord;
  } catch {
    return null;
  }
};

const writePremiumAuth = (next: PremiumAuthRecord) => {
  try {
    ensureMetaDir();
    fs.writeFileSync(PREMIUM_AUTH_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // ignore
  }
};

const nowSec = () => Math.floor(Date.now() / 1000);

const getPremiumTokenTiming = (rec: PremiumAuthRecord | null): {
  obtainedAtSec: number | null;
  expiresAtSec: number | null;
} => {
  try {
    if (!rec) return { obtainedAtSec: null, expiresAtSec: null };
    const token: any = rec.token || {};

    const obtainedAtFromToken =
      typeof token.obtained_at === "number" && Number.isFinite(token.obtained_at)
        ? Math.floor(token.obtained_at)
        : null;

    const expiresAtFromToken =
      typeof token.expires_at === "number" && Number.isFinite(token.expires_at)
        ? Math.floor(token.expires_at)
        : null;

    if (obtainedAtFromToken && expiresAtFromToken) {
      return { obtainedAtSec: obtainedAtFromToken, expiresAtSec: expiresAtFromToken };
    }

    const obtainedAtIsoMs = Date.parse(rec.obtainedAt);
    const obtainedAtSec = Number.isFinite(obtainedAtIsoMs)
      ? Math.floor(obtainedAtIsoMs / 1000)
      : obtainedAtFromToken;

    const expiresIn =
      typeof token.expires_in === "number" && Number.isFinite(token.expires_in)
        ? Math.floor(token.expires_in)
        : null;

    const expiresAtSec =
      obtainedAtSec && expiresIn ? obtainedAtSec + expiresIn : expiresAtFromToken;

    return { obtainedAtSec: obtainedAtSec ?? null, expiresAtSec: expiresAtSec ?? null };
  } catch {
    return { obtainedAtSec: null, expiresAtSec: null };
  }
};

const refreshPremiumTokenIfNeeded = async (): Promise<PremiumAuthRecord | null> => {
  const rec = readPremiumAuth();
  if (!rec) return null;

  const refreshToken = typeof (rec as any)?.token?.refresh_token === "string" ? String((rec as any).token.refresh_token).trim() : "";
  const accessToken = typeof (rec as any)?.token?.access_token === "string" ? String((rec as any).token.access_token).trim() : "";
  if (!refreshToken) return rec;

  const { expiresAtSec } = getPremiumTokenTiming(rec);
  const n = nowSec();
  const skew = 90; // refresh a bit early
  const stillValid = typeof expiresAtSec === "number" && Number.isFinite(expiresAtSec) && expiresAtSec - skew > n;
  if (stillValid && accessToken) return rec;

  const tokenUrlRaw =
    String(process.env.HYTALE_OAUTH_TOKEN_URL ?? "").trim() ||
    "https://oauth.accounts.hytale.com/oauth2/token";

  // Official launcher uses Basic auth with client_id "hytale-launcher" and an empty secret.
  // Header value should be: Basic aHl0YWxlLWxhdW5jaGVyOg==
  const basicAuth = `Basic ${Buffer.from("hytale-launcher:").toString("base64")}`;
  const userAgent =
    String(process.env.HYTALE_OAUTH_USER_AGENT ?? process.env.HYTALE_LAUNCHER_USER_AGENT ?? "").trim() ||
    "hytale-launcher/2026.02.06-b95ae53";
  const launcherBranch =
    String(process.env.HYTALE_OAUTH_LAUNCHER_BRANCH ?? process.env.HYTALE_LAUNCHER_BRANCH ?? "").trim() ||
    "release";
  const launcherVersion =
    String(process.env.HYTALE_OAUTH_LAUNCHER_VERSION ?? process.env.HYTALE_LAUNCHER_VERSION ?? "").trim() ||
    "2026.02.06-b95ae53";

  try {
    const tokenUrl = new URL(tokenUrlRaw);
    const body = new URLSearchParams();
    body.set("grant_type", "refresh_token");
    body.set("refresh_token", refreshToken);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: basicAuth,
    };
    if (userAgent) headers["User-Agent"] = userAgent;
    if (launcherBranch) headers["X-Hytale-Launcher-Branch"] = launcherBranch;
    if (launcherVersion) headers["X-Hytale-Launcher-Version"] = launcherVersion;

    const resp = await fetch(tokenUrl.toString(), { method: "POST", headers, body });
    const text = await resp.text();
    let tokenJson: any = null;
    try {
      tokenJson = JSON.parse(text);
    } catch {
      tokenJson = null;
    }

    if (!resp.ok) {
      // If refresh fails due to invalid/expired session, force a logout to the account selector.
      // Avoid logging users out on transient server errors.
      const errorCode = typeof tokenJson?.error === "string" ? tokenJson.error : "";
      const shouldForceLogout =
        (resp.status >= 400 && resp.status < 500) ||
        errorCode === "invalid_grant" ||
        errorCode === "invalid_token";

      logger.warn("Premium token refresh failed", {
        status: resp.status,
        error: errorCode || null,
        text: text.slice(0, 200),
      });

      if (shouldForceLogout) {
        try {
          premiumForceLogoutPending = true;
          clearPremiumAuth();
        } catch {
          // ignore
        }
        return null;
      }

      // Otherwise, keep existing token (may still be usable, or user might be offline).
      return rec;
    }

    const nextAccess = typeof tokenJson?.access_token === "string" ? tokenJson.access_token.trim() : "";
    if (!nextAccess) {
      // Treat a successful response without an access token as an invalid refresh.
      try {
        premiumForceLogoutPending = true;
        clearPremiumAuth();
      } catch {
        // ignore
      }
      return null;
    }

    const obtainedAt = nowSec();
    const expiresIn = typeof tokenJson?.expires_in === "number" && Number.isFinite(tokenJson.expires_in) ? Math.floor(tokenJson.expires_in) : 3600;
    const expiresAt = obtainedAt + Math.max(1, expiresIn);

    const prevToken: any = rec.token || {};
    const mergedToken: any = {
      ...prevToken,
      ...tokenJson,
      // Ensure these exist for the installer and status checks.
      obtained_at: obtainedAt,
      expires_in: expiresIn,
      expires_at: expiresAt,
      // Keep refresh_token if server doesn't return it.
      refresh_token:
        typeof tokenJson?.refresh_token === "string" && tokenJson.refresh_token.trim()
          ? tokenJson.refresh_token.trim()
          : prevToken.refresh_token,
      // Keep id_token if refresh response doesn't include it.
      id_token:
        typeof tokenJson?.id_token === "string" && tokenJson.id_token.trim()
          ? tokenJson.id_token.trim()
          : prevToken.id_token,
    };

    const nextRec: PremiumAuthRecord = {
      ...rec,
      obtainedAt: new Date().toISOString(),
      token: mergedToken,
    };
    writePremiumAuth(nextRec);
    return nextRec;
  } catch (e) {
    logger.warn("Premium token refresh threw", e);
    return rec;
  }
};

const premiumLauncherUa = () =>
  String(process.env.HYTALE_LAUNCHER_USER_AGENT ?? "").trim() ||
  "hytale-launcher/2026.02.12-54e579b";

const premiumLauncherBranch = () =>
  String(process.env.HYTALE_LAUNCHER_BRANCH ?? process.env.HYTALE_OAUTH_LAUNCHER_BRANCH ?? "").trim() ||
  "release";

const premiumLauncherVersion = () =>
  String(process.env.HYTALE_LAUNCHER_VERSION ?? "").trim() ||
  // default to whatever is after the UA slash
  (premiumLauncherUa().split("/")[1] || "2026.02.12-54e579b");

const getOfficialOsArch = (): { os: string; arch: string } => {
  const os =
    process.platform === "win32"
      ? "windows"
      : process.platform === "darwin"
        ? "macos"
        : "linux";
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  return { os, arch };
};

const normalizeOfficialUuid = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      s,
    )
  ) {
    return s.toLowerCase();
  }
  return null;
};

const normalizeOfficialUsername = (raw: unknown): string | null => {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? s : null;
};

const syncPremiumLauncherProfileBestEffort = async (): Promise<void> => {
  try {
    const rec = readPremiumAuth();
    if (!rec) return;

    // Refresh first so the access token is current.
    const refreshed = await refreshPremiumTokenIfNeeded();
    const accessToken = typeof refreshed?.token?.access_token === "string" ? refreshed.token.access_token.trim() : "";
    if (!accessToken) return;

    const { os, arch } = getOfficialOsArch();
    const url = `https://account-data.hytale.com/my-account/get-launcher-data?arch=${encodeURIComponent(
      arch,
    )}&os=${encodeURIComponent(os)}`;

    const dbgRaw = String(process.env.HYTALE_PREMIUM_HTTP_DEBUG ?? process.env.PREMIUM_HTTP_DEBUG ?? "").trim().toLowerCase();
    const dbg = dbgRaw === "1" || dbgRaw === "true" || dbgRaw === "yes" || dbgRaw === "on";

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": premiumLauncherUa(),
        "X-Hytale-Launcher-Branch": premiumLauncherBranch(),
        "X-Hytale-Launcher-Version": premiumLauncherVersion(),
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
    });

    if (dbg) {
      logger.info("Premium HTTP get-launcher-data (startup sync)", {
        req: {
          method: "GET",
          url,
          headers: {
            Authorization: "<redacted>",
            "User-Agent": premiumLauncherUa(),
            "X-Hytale-Launcher-Branch": premiumLauncherBranch(),
            "X-Hytale-Launcher-Version": premiumLauncherVersion(),
            Accept: "application/json",
            "Accept-Encoding": "gzip",
          },
        },
        res: { status: res.status },
      });
    }

    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 200);
      logger.warn("Premium get-launcher-data failed", { status: res.status, snippet });
      return;
    }

    const bodyText = await res.text().catch(() => "");
    if (dbg) {
      logger.info("Premium HTTP get-launcher-data body (startup sync)", {
        res: { status: res.status, body: bodyText.length > 1200 ? `${bodyText.slice(0, 1200)}…` : bodyText },
      });
    }
    let json: any = null;
    try {
      json = JSON.parse(bodyText);
    } catch {
      json = null;
    }
    const profiles: any[] = Array.isArray(json?.profiles) ? json.profiles : [];
    const first = profiles.length ? profiles[0] : null;
    const username = normalizeOfficialUsername(first?.username);
    const uuid = normalizeOfficialUuid(first?.uuid);
    if (!username || !uuid) return;

    const owner = typeof json?.owner === "string" ? json.owner.trim() : undefined;
    const eulaAcceptedAt = typeof json?.eula_accepted_at === "string" ? json.eula_accepted_at.trim() : undefined;

    writePremiumAuth({
      ...(refreshed as PremiumAuthRecord),
      profile: {
        displayName: refreshed?.profile?.displayName || username,
        ...(refreshed?.profile?.sub ? { sub: refreshed.profile.sub } : {}),
        username,
        uuid,
        ...(owner ? { owner } : {}),
        ...(eulaAcceptedAt ? { eulaAcceptedAt } : {}),
      },
    });
  } catch (e) {
    logger.warn("Premium profile sync threw", e);
  }
};

function clearPremiumAuth() {
  try {
    if (fs.existsSync(PREMIUM_AUTH_FILE)) fs.unlinkSync(PREMIUM_AUTH_FILE);
  } catch {
    // ignore
  }
}

const toBase64Url = (buf: Buffer) =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const toBase64Std = (buf: Buffer) => buf.toString("base64");

const sha256Base64Url = (s: string) =>
  toBase64Url(crypto.createHash("sha256").update(s).digest());

const decodeJwtPayloadBestEffort = (jwt: unknown): any | null => {
  try {
    if (typeof jwt !== "string") return null;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    // Pad base64 string
    while (b64.length % 4 !== 0) b64 += "=";
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
};

let premiumOauthInFlight: { startedAt: number; cancel: (reason?: string) => void } | null = null;
let premiumForceLogoutPending = false;

const ensureMetaDir = () => {
  try {
    if (!fs.existsSync(META_DIRECTORY)) fs.mkdirSync(META_DIRECTORY, { recursive: true });
  } catch {
    // ignore
  }
};

const readLauncherSettings = (): LauncherSettings => {
  try {
    ensureMetaDir();
    if (!fs.existsSync(SETTINGS_FILE)) return {};
    const raw = fs.readFileSync(SETTINGS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as LauncherSettings;
  } catch {
    return {};
  }
};

const writeLauncherSettings = (next: LauncherSettings) => {
  try {
    ensureMetaDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // ignore
  }
};

const isUsableDirectory = (p: unknown): p is string => {
  if (typeof p !== "string") return false;
  const trimmed = p.trim();
  if (!trimmed) return false;
  if (!path.isAbsolute(trimmed)) return false;
  try {
    if (!fs.existsSync(trimmed)) fs.mkdirSync(trimmed, { recursive: true });
    return fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory();
  } catch {
    return false;
  }
};

const computeDefaultGameDirectory = (): string => {
  try {
    if (process.platform === "linux") {
      const xdgBase =
        process.env["XDG_DATA_HOME"] &&
        path.isAbsolute(process.env["XDG_DATA_HOME"]!)
          ? process.env["XDG_DATA_HOME"]!
          : path.join(os.homedir(), ".local", "share");
      const newPath = path.join(xdgBase, "butter-launcher", "Hytale");
      const legacyPath = path.join(META_DIRECTORY, "Hytale");
      if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) return legacyPath;
      return newPath;
    }
  } catch {
    // ignore
  }
  return path.join(META_DIRECTORY, "Hytale");
};

const getEffectiveDownloadDirectory = (): string => {
  const settings = readLauncherSettings();
  const candidate = settings.downloadDirectory;
  if (isUsableDirectory(candidate)) return candidate.trim();
  return computeDefaultGameDirectory();
};

const getSteamDeckModeEnabled = (): boolean => {
  const settings = readLauncherSettings();
  return settings.steamDeckMode === true;
};

const applySteamDeckModeAcrossInstalled = (
  gameDir: string,
  enabled: boolean,
): {
  ok: boolean;
  enabled: boolean;
  changed: number;
  failed: number;
  details: Array<{ type: string; build_index: number; ok: boolean; applied: boolean; restored: boolean; message?: string }>;
  message?: string;
} => {
  if (process.platform !== "linux") {
    return {
      ok: true,
      enabled,
      changed: 0,
      failed: 0,
      details: [],
      message: "SteamDeck mode changes are only applied on Linux.",
    };
  }

  const installed = listInstalledVersions(gameDir);
  const details: Array<{ type: string; build_index: number; ok: boolean; applied: boolean; restored: boolean; message?: string }> = [];
  let changed = 0;
  let failed = 0;

  for (const info of installed) {
    const v: GameVersion = {
      url: "",
      type: info.type as any,
      build_index: info.build_index,
      build_name: info.build_name || `Build-${info.build_index}`,
      isLatest: !!info.isLatest,
    };

    const r = applySteamDeckFixForVersion(gameDir, v, enabled);
    details.push({
      type: v.type,
      build_index: v.build_index,
      ok: r.ok,
      applied: r.applied,
      restored: r.restored,
      message: r.message,
    });
    if (!r.ok) failed++;
    if (r.applied || r.restored) changed++;
  }

  return {
    ok: failed === 0,
    enabled,
    changed,
    failed,
    details,
    message:
      installed.length === 0
        ? "No installed builds found to patch."
        : undefined,
  };
};

app.on("ready", () => {
  app.setAppUserModelId("com.butter.launcher");
  // Launcher updates are handled via version.json (renderer UI prompt).

  logger.info(`Butter Launcher is starting...
    App Version: ${app.getVersion()}
    Platform: ${os.type()} ${os.release()}
    Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB / ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB
    Electron: ${process.versions.electron}, Node: ${process.versions.node}, Chromium: ${process.versions.chrome}
  `);
});

app.on("before-quit", () => {
  // NOTE: don't do async work here without preventDefault, or Windows will quit
  // fast enough that Discord RPC never gets the "clear" packet.
});

let rpcShutdownStarted = false;
const shutdownDiscordRpc = async () => {
  if (rpcShutdownStarted) return;
  rpcShutdownStarted = true;

  try {
    const timeoutMs = 1500;
    await Promise.race([
      Promise.resolve(disconnectRPC()),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // best-effort
  }
};

app.on("before-quit", (e) => {
  // If the launcher is actually quitting, ensure we don't leave a Java server running.
  stopHostServerProcess("app-before-quit");

  if (rpcShutdownStarted) {
    isQuitting = true;
    return;
  }

  // Give RPC a moment to clear presence.
  e.preventDefault();
  isQuitting = true;
  void (async () => {
    await shutdownDiscordRpc();
    app.quit();
  })();
});

app.on("will-quit", () => {
  stopHostServerProcess("app-will-quit");
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
let runningGameBuildKey: string | null = null;

// Prevent overlapping online patch operations (double-click spam / race conditions).
const onlinePatchInFlight = new Set<string>();

const onlinePatchKey = (gameDir: string, version: GameVersion) =>
  `${gameDir}::${version.type}::${version.build_index}`;

const buildKey = (version: { type: GameVersion["type"]; build_index: number }) =>
  `${version.type}::${version.build_index}`;

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

  // Reduce background chatter (best-effort).
  // Note: keep Discord Rich Presence active while in tray/background.
};

const blockDevToolsHotkey = (w: BrowserWindow) => {
  // Prevent opening DevTools via Ctrl+Shift+I (Windows/Linux).
  // This is enforced in the main process so it can't be bypassed from the renderer.
  try {
    w.webContents.on("before-input-event", (event, input) => {
      if (input.type !== "keyDown") return;

      const key = String(input.key ?? "").toLowerCase();
      if (input.control && input.shift && key === "i") {
        event.preventDefault();
      }
    });
  } catch {
    // ignore
  }
};

const WIKI_PARTITION = "persist:wikiviewer";

const isAllowedWikiUrl = (rawUrl: string): boolean => {
  const s = String(rawUrl ?? "").trim();
  if (!s) return false;
  if (s === "about:blank") return true;

  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host === "hytalewiki.org" || host.endsWith(".hytalewiki.org");
  } catch {
    return false;
  }
};

const installWikiWebviewGuards = () => {
  const wikiSession = session.fromPartition(WIKI_PARTITION);

  const clampZoom = (z: number) => Math.max(0.25, Math.min(5, z));

  // Enforce navigation restrictions in the main process so the renderer can't bypass them.
  app.on("web-contents-created", (_event, contents) => {
    try {
      if (contents.getType() !== "webview") return;
      if (contents.session !== wikiSession) return;

      try {
        void contents.setVisualZoomLevelLimits(1, 5);
      } catch {
        // ignore
      }

      contents.setWindowOpenHandler(({ url }) => {
        // Never allow new windows. If it's an allowed wiki URL, keep it in the same webview.
        if (isAllowedWikiUrl(url)) {
          try {
            void contents.loadURL(url);
          } catch {
            // ignore
          }
        }
        return { action: "deny" };
      });

      // Prevent opening DevTools via Ctrl+Shift+I inside the webview.
      contents.on("before-input-event", (event, input) => {
        const type = String(input.type ?? "");

        // Ctrl+Shift+I
        if (type === "keyDown") {
          const key = String(input.key ?? "").toLowerCase();
          if (input.control && input.shift && key === "i") {
            event.preventDefault();
            return;
          }

          // Ctrl +/-/0 zoom
          if (input.control && !input.shift) {
            if (key === "+" || key === "=" || key === "add") {
              event.preventDefault();
              contents.zoomFactor = clampZoom((contents.zoomFactor ?? 1) * 1.1);
              return;
            }

            if (key === "-" || key === "subtract") {
              event.preventDefault();
              contents.zoomFactor = clampZoom((contents.zoomFactor ?? 1) / 1.1);
              return;
            }

            if (key === "0" || key === "num0") {
              event.preventDefault();
              contents.zoomFactor = 1;
              return;
            }
          }
        }

        // Ctrl + mouse wheel zoom
        if (type === "mouseWheel" && input.control) {
          event.preventDefault();
          const deltaY = typeof (input as any).deltaY === "number" ? (input as any).deltaY : 0;
          const zoomIn = deltaY < 0;
          const factor = zoomIn ? 1.1 : 1 / 1.1;
          contents.zoomFactor = clampZoom((contents.zoomFactor ?? 1) * factor);
        }
      });

      contents.on("will-navigate", (event, url) => {
        if (!isAllowedWikiUrl(url)) event.preventDefault();
      });

      contents.on("will-redirect", (event, url) => {
        if (!isAllowedWikiUrl(url)) event.preventDefault();
      });
    } catch {
      // ignore
    }
  });
};

let wikiStorageClearedOnQuit = false;
app.on("before-quit", (e) => {
  // Best-effort: ensure wiki cookies/storage don't survive restarts.
  if (wikiStorageClearedOnQuit) return;
  wikiStorageClearedOnQuit = true;
  e.preventDefault();

  try {
    const wikiSession = session.fromPartition(WIKI_PARTITION);
    void wikiSession
      .clearStorageData({
        storages: ["cookies", "localstorage", "sessionstorage", "indexdb", "cache"],
      })
      .catch(() => {})
      .finally(() => {
        try {
          app.quit();
        } catch {
          // ignore
        }
      });
  } catch {
    try {
      app.quit();
    } catch {
      // ignore
    }
  }
});

function createWindow() {
  const icon = resolveAppIcon();

  // frame: false means we get to reinvent window controls. What could go wrong.
  win = new BrowserWindow({
    width: 1026,
    height: 640,
    frame: false,
    titleBarStyle: "hidden",
    resizable: true,
    maximizable: true,
    backgroundColor: "#00000000",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      webviewTag: true,
    },
  });

  blockDevToolsHotkey(win);

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
  installWikiWebviewGuards();
  createWindow();

  // Best-effort: refresh Premium token on startup so patch downloads work immediately.
  void refreshPremiumTokenIfNeeded();
  // Best-effort: also fetch official username/uuid for Premium.
  void syncPremiumLauncherProfileBestEffort();

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
ipcMain.on("toggle-maximize-window", () => {
  // The button is simple. The OS window state machine is... less simple.
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
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

  // If Premium refresh invalidated the session during startup (before the renderer mounted),
  // bounce the user back to the Premium/No Premium selector.
  if (premiumForceLogoutPending) {
    premiumForceLogoutPending = false;
    try {
      win?.webContents.send("premium:force-logout");
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

ipcMain.handle("launcher-settings:startup-sound:get", async () => {
  try {
    const { settings, existed, settingsPath } = readOrInitLauncherSettings();
    return {
      ok: true,
      existed,
      playstartupsound: !!settings.playstartupsound,
      firstRunStartupSoundPending: !!settings.firstRunStartupSoundPending,
      settingsPath,
      error: null as string | null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return {
      ok: false,
      existed: false,
      playstartupsound: false,
      firstRunStartupSoundPending: false,
      settingsPath: "",
      error: message,
    };
  }
});

ipcMain.handle("launcher-settings:startup-sound:set", async (_, enabled: boolean) => {
  try {
    const res = setPlayStartupSound(!!enabled);
    return { ok: res.ok, settingsPath: res.settingsPath, error: res.ok ? null : "Failed to write settings" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, settingsPath: "", error: message };
  }
});

ipcMain.handle("launcher-settings:startup-sound:first-run-played", async () => {
  try {
    const res = markFirstRunStartupSoundPlayed();
    return { ok: res.ok, settingsPath: res.settingsPath, error: res.ok ? null : "Failed to write settings" };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, settingsPath: "", error: message };
  }
});

ipcMain.handle("fetch:json", async (_, url, ...args) => {
  const response = await fetch(url, ...args);
  return await response.json();
});
ipcMain.handle("fetch:head", async (_, url, ...args) => {
  const response = await fetch(url, ...args);
  return response.status;
});

ipcMain.handle("premium:status", async () => {
  try {
    const rec = await refreshPremiumTokenIfNeeded();
    // Keep Premium identity synced for the UI.
    void syncPremiumLauncherProfileBestEffort();
    const accessToken = rec?.token?.access_token;
    const loggedIn = typeof accessToken === "string" && !!accessToken.trim();
    return {
      ok: true,
      loggedIn,
      profile: rec?.profile ?? null,
      error: null as string | null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, loggedIn: false, profile: null, error: message };
  }
});

ipcMain.handle("premium:logout", async () => {
  try {
    clearPremiumAuth();
    return { ok: true, error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("premium:oauth:cancel", async () => {
  try {
    if (premiumOauthInFlight) {
      premiumOauthInFlight.cancel("Cancelled");
    }
    // Extra paranoia: make sure the next click isn't blocked.
    premiumOauthInFlight = null;
    return { ok: true, error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("premium:oauth:start", async () => {
  // Guard against users clicking the button 17 times because the browser took 3 seconds.
  if (premiumOauthInFlight) {
    return { ok: false, displayName: "", error: "Login already in progress" };
  }
  const cleanup = () => {
    premiumOauthInFlight = null;
  };

  let server: ReturnType<typeof createServer> | null = null;
  let rejectCb: ((e: any) => void) | null = null;
  let timeout: NodeJS.Timeout | null = null;

  premiumOauthInFlight = {
    startedAt: Date.now(),
    cancel: (reason?: string) => {
      try {
        if (timeout) clearTimeout(timeout);
      } catch {
        // ignore
      }

      try {
        server?.close();
      } catch {
        // ignore
      }

      try {
        rejectCb?.(new Error(reason || "Cancelled"));
      } catch {
        // ignore
      }

      cleanup();
    },
  };

  try {
    const authUrlRaw = String(process.env.HYTALE_OAUTH_AUTH_URL ?? "").trim();
    const tokenUrlRaw = String(process.env.HYTALE_OAUTH_TOKEN_URL ?? "").trim();
    const clientId = String(process.env.HYTALE_OAUTH_CLIENT_ID ?? "").trim();
    const redirectUriRaw = String(process.env.HYTALE_OAUTH_REDIRECT_URI ?? "").trim();
    const scope = String(process.env.HYTALE_OAUTH_SCOPES ?? "openid profile").trim();
    const accessType = String(process.env.HYTALE_OAUTH_ACCESS_TYPE ?? "").trim();
    const userAgent = String(process.env.HYTALE_OAUTH_USER_AGENT ?? "").trim();
    const launcherBranch = String(process.env.HYTALE_OAUTH_LAUNCHER_BRANCH ?? "").trim();
    const launcherVersion = String(process.env.HYTALE_OAUTH_LAUNCHER_VERSION ?? "").trim();

    // Important: for Hytale we want to send Basic auth even if the secret is empty.
    // dotenv can set HYTALE_OAUTH_CLIENT_SECRET="" and we still need to send it.
    const hasClientSecretEnv = Object.prototype.hasOwnProperty.call(process.env, "HYTALE_OAUTH_CLIENT_SECRET");
    const clientSecret = String(process.env.HYTALE_OAUTH_CLIENT_SECRET ?? "");

    if (!authUrlRaw || !tokenUrlRaw || !clientId) {
      return {
        ok: false,
        displayName: "",
        error:
          "Premium login is not configured (missing HYTALE_OAUTH_AUTH_URL / HYTALE_OAUTH_TOKEN_URL / HYTALE_OAUTH_CLIENT_ID)",
      };
    }

    const authBase = new URL(authUrlRaw);
    const tokenUrl = new URL(tokenUrlRaw);

    const codeVerifier = toBase64Url(crypto.randomBytes(32));
    const codeChallenge = sha256Base64Url(codeVerifier);
    // Inner state: the value we expect back on localhost.
    // Python uses uppercase-ish; it's cosmetic but helps mirror real traffic.
    const innerState = toBase64Url(crypto.randomBytes(18)).toUpperCase();

    server = createServer();

    const callbackPromise = new Promise<{ code: string }>((resolve, reject) => {
      rejectCb = reject;
      const timeoutMs = 3 * 60 * 1000;
      timeout = setTimeout(() => {
        reject(new Error("Login timed out"));
      }, timeoutMs);

      server!.on("request", (req, res) => {
        try {
          const url = new URL(req.url ?? "/", "http://127.0.0.1");
          if (url.pathname !== "/authorization-callback") {
            res.statusCode = 404;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Not found");
            return;
          }

          const renderPage = (opts: {
            title: string;
            subtitle?: string;
            variant: "ok" | "error";
            details?: string;
          }) => {
            const safeTitle = String(opts.title ?? "");
            const safeSubtitle = String(opts.subtitle ?? "");
            const safeDetails = String(opts.details ?? "");

            const accent = opts.variant === "ok" ? "#02D4D4" : "#F87171";
            const badgeBg = opts.variant === "ok" ? "rgba(2, 212, 212, 0.12)" : "rgba(248, 113, 113, 0.12)";
            const badgeText = opts.variant === "ok" ? "Success" : "Error";

            return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        background: #0b0f16;
        color: #e5e7eb;
        font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,Arial,sans-serif;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      .card {
        width: min(560px, calc(100vw - 32px));
        background: rgba(26, 31, 46, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 12px;
        padding: 20px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.35);
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .brand {
        font-weight: 700;
        letter-spacing: 0.4px;
        color: #cbd5e1;
        opacity: 0.95;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: ${badgeBg};
        color: ${accent};
        font-size: 12px;
        font-weight: 600;
        border: 1px solid rgba(148, 163, 184, 0.18);
      }
      h1 {
        margin: 0;
        font-size: 18px;
        line-height: 1.2;
        color: #ffffff;
      }
      p {
        margin: 10px 0 0 0;
        font-size: 13px;
        line-height: 1.55;
        color: #94a3b8;
      }
      .details {
        margin-top: 12px;
        padding: 10px 12px;
        border-radius: 10px;
        background: rgba(15, 19, 26, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.12);
        color: #cbd5e1;
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .actions {
        margin-top: 16px;
        display: flex;
        justify-content: flex-end;
      }
      button {
        height: 36px;
        padding: 0 14px;
        border-radius: 10px;
        border: 1px solid rgba(148, 163, 184, 0.26);
        background: transparent;
        color: #e5e7eb;
        cursor: pointer;
        font-weight: 600;
      }
      button:hover { background: rgba(26, 31, 46, 0.9); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="top">
        <div class="brand">Butter Launcher</div>
        <div class="badge">${badgeText}</div>
      </div>
      <h1>${safeTitle}</h1>
      ${safeSubtitle ? `<p>${safeSubtitle}</p>` : ``}
      ${safeDetails ? `<div class="details">${safeDetails}</div>` : ``}
      <div class="actions">
        <button onclick="this.textContent='See? Told you it was useless.'; this.disabled=true; return false;">useless button</button>
      </div>
      <p style="margin-top: 12px; opacity: 0.75;">Return to the launcher to continue. You can close this window.</p>
    </div>
  </body>
</html>`;
          };

          const returnedState = url.searchParams.get("state") ?? "";
          const code = url.searchParams.get("code") ?? "";
          const error = url.searchParams.get("error") ?? "";
          const errorDesc = url.searchParams.get("error_description") ?? "";

          if (error) {
            if (timeout) clearTimeout(timeout);
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(
              renderPage({
                title: "Login failed",
                subtitle: "Hytale returned an error during sign-in.",
                variant: "error",
                details: [error, errorDesc].filter(Boolean).join("\n"),
              }),
            );
            reject(new Error(errorDesc || error));
            return;
          }

          if (!code || returnedState !== innerState) {
            if (timeout) clearTimeout(timeout);
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(
              renderPage({
                title: "Login failed",
                subtitle: "Invalid callback received by the launcher.",
                variant: "error",
                details: "The authorization response did not match the expected session.",
              }),
            );
            reject(new Error("Invalid OAuth callback"));
            return;
          }

          if (timeout) clearTimeout(timeout);
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            renderPage({
              title: "Login complete",
              subtitle: "You’re signed in. Return to the launcher to continue. You can close this window.",
              variant: "ok",
            }),
          );
          resolve({ code });
        } catch (e) {
          if (timeout) clearTimeout(timeout);
          try {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Internal error");
          } catch {
            // ignore
          }
          reject(e);
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", () => resolve());
    });

    const addr = server.address();
    const port = typeof addr === "object" && addr && typeof addr.port === "number" ? addr.port : 0;
    if (!port) {
      try {
        server.close();
      } catch {
        // ignore
      }
      return { ok: false, displayName: "", error: "Failed to start callback server" };
    }

    const localCallback = `http://127.0.0.1:${port}/authorization-callback`;

    // Hytale launcher-style flow:
    // - redirect_uri is the consent endpoint (NOT localhost)
    // - state is base64(JSON { state: inner_state, port }) so Hytale can bounce back to localhost.
    const redirectUri = redirectUriRaw || "https://accounts.hytale.com/consent/client";
    const outerStateJson = JSON.stringify({ state: innerState, port: String(port) });
    const outerStateB64 = toBase64Std(Buffer.from(outerStateJson, "utf8"));

    // Build authorization URL.
    const authorize = new URL(authBase.toString());
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", clientId);
    authorize.searchParams.set("redirect_uri", redirectUri);
    authorize.searchParams.set("scope", scope);
    authorize.searchParams.set("state", outerStateB64);
    authorize.searchParams.set("code_challenge", codeChallenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    if (accessType) authorize.searchParams.set("access_type", accessType);

    // Launch system browser.
    await shell.openExternal(authorize.toString());

    // Wait for callback.
    const { code } = await callbackPromise;

    try {
      server.close();
    } catch {
      // ignore
    }

    // Exchange code for tokens.
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code);
    body.set("redirect_uri", redirectUri);
    body.set("code_verifier", codeVerifier);

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    };

    // Mirror the launcher: always use Basic auth when HYTALE_OAUTH_CLIENT_SECRET exists (even empty).
    if (hasClientSecretEnv) {
      headers["Authorization"] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    }

    if (userAgent) headers["User-Agent"] = userAgent;
    if (launcherBranch) headers["X-Hytale-Launcher-Branch"] = launcherBranch;
    if (launcherVersion) headers["X-Hytale-Launcher-Version"] = launcherVersion;

    const resp = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers,
      body,
    });

    const text = await resp.text();
    let tokenJson: any = null;
    try {
      tokenJson = JSON.parse(text);
    } catch {
      tokenJson = null;
    }

    if (!resp.ok) {
      const desc =
        (tokenJson && (tokenJson.error_description || tokenJson.error)) ||
        `Token exchange failed (${resp.status})`;
      return { ok: false, displayName: "", error: String(desc) };
    }

    const idToken = tokenJson?.id_token;
    const payload = decodeJwtPayloadBestEffort(idToken);
    const displayName =
      String(payload?.preferred_username || payload?.name || payload?.email || payload?.sub || "Premium").trim() ||
      "Premium";
    const sub = typeof payload?.sub === "string" ? payload.sub : undefined;

    const obtainedAtSec = nowSec();
    const expiresIn =
      typeof tokenJson?.expires_in === "number" && Number.isFinite(tokenJson.expires_in)
        ? Math.floor(tokenJson.expires_in)
        : 3600;
    const expiresAtSec = obtainedAtSec + Math.max(1, expiresIn);

    const tokenWithTiming: any = {
      ...(tokenJson ?? {}),
      obtained_at: obtainedAtSec,
      expires_in: expiresIn,
      expires_at: expiresAtSec,
    };

    writePremiumAuth({
      version: 1,
      obtainedAt: new Date().toISOString(),
      token: tokenWithTiming,
      profile: { displayName, ...(sub ? { sub } : {}) },
    });

    return { ok: true, displayName, error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, displayName: "", error: message };
  } finally {
    cleanup();
  }
});

const getModsDir = (gameDir: string) => path.join(gameDir, "UserData", "Mods");
const getModsProfilesPath = (gameDir: string) =>
  path.join(gameDir, "UserData", "mod-profiles.json");
const getModsRegistryPath = (gameDir: string) =>
  path.join(gameDir, "UserData", "mods-installed.json");

type ModRegistryEntry = {
  modId: number;
  fileId?: number;
  fileName?: string;
  installedAt?: string;
};

const readModsRegistry = async (gameDir: string): Promise<ModRegistryEntry[]> => {
  const p = getModsRegistryPath(gameDir);
  try {
    const raw = await fs.promises.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return items
      .map((x: any) => {
        const modId = Number(x?.modId);
        const fileId = x?.fileId != null ? Number(x.fileId) : undefined;
        const fileName = typeof x?.fileName === "string" ? x.fileName : undefined;
        const installedAt = typeof x?.installedAt === "string" ? x.installedAt : undefined;
        if (!Number.isFinite(modId) || modId <= 0) return null;
        return {
          modId,
          fileId: Number.isFinite(fileId as number) && (fileId as number) > 0 ? (fileId as number) : undefined,
          fileName,
          installedAt,
        } as ModRegistryEntry;
      })
      .filter(Boolean) as ModRegistryEntry[];
  } catch {
    return [];
  }
};

const writeModsRegistry = async (gameDir: string, items: ModRegistryEntry[]) => {
  const dir = path.join(gameDir, "UserData");
  await fs.promises.mkdir(dir, { recursive: true });
  const p = getModsRegistryPath(gameDir);
  const payload = {
    version: 1,
    items,
  };
  await fs.promises.writeFile(p, JSON.stringify(payload, null, 2), "utf8");
};

const upsertRegistryEntry = async (gameDir: string, entry: ModRegistryEntry) => {
  const existing = await readModsRegistry(gameDir);
  const next = existing.filter((x) => x.modId !== entry.modId);
  next.push(entry);
  next.sort((a, b) => a.modId - b.modId);
  await writeModsRegistry(gameDir, next);
};

const deleteModFileBestEffort = async (gameDir: string, fileName: string) => {
  try {
    const safe = assertSafeFileName(fileName);
    const modsDir = getModsDir(gameDir);
    const candidates = new Set<string>();
    candidates.add(safe);
    candidates.add(`${safe}.disabled`);
    if (safe.endsWith(".disabled")) {
      candidates.add(safe.replace(/\.disabled$/i, ""));
    }
    for (const name of candidates) {
      try {
        await fs.promises.unlink(path.join(modsDir, name));
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
};

type ModProfile = {
  name: string;
  mods: string[]; // file base names (no .disabled)
  cf?: Record<string, { modId: number; fileId?: number }>; // key: baseName.toLowerCase()
  // A tiny stash of CF "facts" so we can re-download what users delete.
};

// The one profile you can't mess up: it disables everything, like a proper "it works on my machine" setup.
const VANILLA_PROFILE_NAME = "Vanilla";

const canonicalizeProfiles = (profiles: ModProfile[]): ModProfile[] => {
  const next: ModProfile[] = [];

  // Always include Vanilla at the top (disables all mods), because humans love foot-guns.
  next.push({ name: VANILLA_PROFILE_NAME, mods: [], cf: undefined });

  const seen = new Set<string>([VANILLA_PROFILE_NAME.toLowerCase()]);
  for (const p of profiles) {
    const name = typeof p?.name === "string" ? p.name : "";
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    if (key === VANILLA_PROFILE_NAME.toLowerCase()) continue;
    const mods = Array.isArray(p?.mods) ? p.mods : [];
    const safeMods = mods.map((m) => normalizeModBaseName(m)).filter(Boolean);
    // Because "version pinning" is just future-proofing with extra steps.
    const cf = sanitizeProfileCfMap(p?.cf, safeMods);
    next.push({ name, mods: safeMods, cf });
    seen.add(key);
  }

  const vanilla = next[0];
  const rest = next.slice(1).sort((a, b) => a.name.localeCompare(b.name));
  return [vanilla, ...rest];
};

const assertSafeProfileName = (name: unknown): string => {
  if (typeof name !== "string") throw new Error("Invalid profile name");
  const s = name.trim();
  if (!s) throw new Error("Invalid profile name");
  if (s.length > 48) throw new Error("Profile name too long");
  if (/[/\\\u0000]/.test(s)) throw new Error("Invalid profile name");
  return s;
};

const normalizeModBaseName = (fileName: unknown): string => {
  const safe = assertSafeFileName(fileName);
  return safe.endsWith(".disabled") ? safe.slice(0, -".disabled".length) : safe;
};

const normalizeProfileCfKey = (base: unknown): string => {
  const safe = normalizeModBaseName(base);
  // Windows doesn't care about case. Users do. Mods do. We choose lowercase and pray.
  return safe.trim().toLowerCase();
};

const sanitizeProfileCfMap = (cf: unknown, mods: string[]): ModProfile["cf"] => {
  if (!cf || typeof cf !== "object") return undefined;
  // Keep only keys that correspond to actual profile mods.
  // Everything else goes straight into the abyss.
  const desired = new Set(mods.map((m) => normalizeProfileCfKey(m)).filter(Boolean));
  const out: Record<string, { modId: number; fileId?: number }> = {};
  for (const [rawKey, rawVal] of Object.entries(cf as Record<string, any>)) {
    const key = typeof rawKey === "string" ? rawKey.trim().toLowerCase() : "";
    if (!key || !desired.has(key)) continue;
    const modId = Number(rawVal?.modId);
    if (!Number.isFinite(modId) || modId <= 0) continue;
    const entry: { modId: number; fileId?: number } = { modId };
    const fileId = Number(rawVal?.fileId);
    if (Number.isFinite(fileId) && fileId > 0) entry.fileId = fileId;
    out[key] = entry;
  }
  return Object.keys(out).length ? out : undefined;
};

const readProfiles = async (gameDir: string): Promise<ModProfile[]> => {
  const p = getModsProfilesPath(gameDir);
  try {
    const raw = await fs.promises.readFile(p, "utf8");
    const parsed = JSON.parse(raw);
    const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
    const cleaned = profiles
      .map((x: any) => ({
        name: assertSafeProfileName(x?.name),
        mods: Array.isArray(x?.mods) ? x.mods.map(normalizeModBaseName) : [],
        cf: undefined as ModProfile["cf"],
      }))
      .map((x: ModProfile, idx: number) => {
        // Re-read the raw entry to sanitize cf only after mods normalization.
        // Yes, it's a second pass. No, it's not glamorous.
        const rawEntry = profiles[idx];
        const cf = sanitizeProfileCfMap(rawEntry?.cf, x.mods);
        return { ...x, cf };
      })
      .filter((x: ModProfile) => !!x.name);
    return canonicalizeProfiles(cleaned);
  } catch {
    return canonicalizeProfiles([]);
  }
};

const writeProfiles = async (gameDir: string, profiles: ModProfile[]) => {
  const dir = path.join(gameDir, "UserData");
  await fs.promises.mkdir(dir, { recursive: true });
  const p = getModsProfilesPath(gameDir);
  const payload = {
    version: 1,
    profiles,
  };
  await fs.promises.writeFile(p, JSON.stringify(payload, null, 2), "utf8");
};

const assertSafeFileName = (name: unknown): string => {
  if (typeof name !== "string") throw new Error("Invalid file name");
  const s = name.trim();
  if (!s) throw new Error("Invalid file name");
  // Prevent path traversal / absolute paths.
  if (s.includes("..") || s.includes("/") || s.includes("\\") || s.includes(":") || s.includes("\u0000")) {
    throw new Error("Invalid file name");
  }
  return s;
};

const toUserFacingModsError = (e: unknown): string => {
  const raw = e instanceof Error ? e.message : "Unknown error";
  const lower = raw.toLowerCase();

  // Don't leak internal config/env guidance to end-users.
  if (
    lower.includes("curseforge api key not configured") ||
    lower.includes("butter_mods_config_url") ||
    lower.includes("x-api-key")
  ) {
    return "Mods are unavailable right now. Please check your internet connection and try again.";
  }

  // Collapse most CF/network-ish failures into a user-friendly message.
  if (
    lower.includes("curseforge") ||
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("eai_again") ||
    lower.includes("network") ||
    lower.includes("tls")
  ) {
    return "We couldn't reach the mods service. Please check your internet connection and try again.";
  }

  if (lower.includes("download failed")) {
    return "Download failed. Please check your internet connection and try again.";
  }

  return raw || "Something went wrong. Please try again.";
};

ipcMain.handle("mods:search", async (_, query?: string) => {
  try {
    const q = typeof query === "string" ? query.trim() : "";
    // Use /mods/search even when q is empty to provide a stable default list.
    const mods = await searchMods(q);
    return { ok: true, mods, error: null as string | null };
  } catch (e) {
    const message = toUserFacingModsError(e);
    return { ok: false, mods: [], error: message };
  }
});

ipcMain.handle(
  "mods:browse",
  async (
    _,
    payload?: {
      query?: string;
      sort?: string;
      index?: number;
      pageSize?: number;
    },
  ) => {
    try {
      const query = typeof payload?.query === "string" ? payload.query : "";
      const sort = typeof payload?.sort === "string" ? payload.sort : "popularity";
      const index = Number.isFinite(payload?.index as number) ? Number(payload!.index) : 0;
      const pageSize = Number.isFinite(payload?.pageSize as number) ? Number(payload!.pageSize) : 24;
      const res = await browseMods({ query, sort: sort as any, index, pageSize });
      return { ok: true, mods: res.mods, pagination: res.pagination, error: null as string | null };
    } catch (e) {
      const message = toUserFacingModsError(e);
      return { ok: false, mods: [], pagination: null, error: message };
    }
  },
);

ipcMain.handle("mods:registry", async (_, gameDir: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, items: [], error: "Invalid gameDir" };
  try {
    const items = await readModsRegistry(dir);
    return { ok: true, items, error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, items: [], error: message };
  }
});

ipcMain.handle("mods:details", async (_, modId: number) => {
  const id = Number(modId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, mod: null, html: "", files: [], error: "Invalid mod id" };
  }

  try {
    const [mod, html, files] = await Promise.all([
      getModDetails(id),
      getModDescriptionHtml(id),
      getModFiles(id, 25),
    ]);
    return { ok: true, mod, html, files, error: null as string | null };
  } catch (e) {
    const message = toUserFacingModsError(e);
    return { ok: false, mod: null, html: "", files: [], error: message };
  }
});

ipcMain.handle("mods:description", async (_, modId: number) => {
  const id = Number(modId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, html: "", error: "Invalid mod id" };
  try {
    const html = await getModDescriptionHtml(id);
    return { ok: true, html };
  } catch (e) {
    const message = toUserFacingModsError(e);
    return { ok: false, html: "", error: message };
  }
});

ipcMain.handle("mods:install", async (event, modId: number, gameDir: string) => {
  const id = Number(modId);
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid mod id" };
  if (!dir) return { ok: false, error: "Invalid gameDir" };

  try {
    const prev = (await readModsRegistry(dir)).find((x) => x.modId === id) ?? null;
    const targetDir = getModsDir(dir);
    const result = await downloadLatestModFile(id, targetDir, (received, total) => {
      event.sender.send("mods:download-progress", { modId: id, received, total });
    });

    // If user installs a different version, remove the previously installed file
    // to avoid multiple versions co-existing.
    if (prev?.fileName && prev.fileName !== result.fileName) {
      await deleteModFileBestEffort(dir, prev.fileName);
    }

    await upsertRegistryEntry(dir, {
      modId: id,
      fileId: result.fileId,
      fileName: result.fileName,
      installedAt: new Date().toISOString(),
    });
    event.sender.send("mods:download-finished", { modId: id, fileId: result.fileId, fileName: result.fileName });
    return { ok: true, fileId: result.fileId, fileName: result.fileName };
  } catch (e) {
    const message = toUserFacingModsError(e);
    event.sender.send("mods:download-error", { modId: id, error: message });
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:install-file", async (event, modId: number, fileId: number, gameDir: string) => {
  const id = Number(modId);
  const fid = Number(fileId);
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Invalid mod id" };
  if (!Number.isFinite(fid) || fid <= 0) return { ok: false, error: "Invalid file id" };
  if (!dir) return { ok: false, error: "Invalid gameDir" };

  try {
    const prev = (await readModsRegistry(dir)).find((x) => x.modId === id) ?? null;
    const targetDir = getModsDir(dir);
    const result = await downloadModFile(id, fid, targetDir, (received, total) => {
      event.sender.send("mods:download-progress", { modId: id, received, total });
    });

    if (prev?.fileName && prev.fileName !== result.fileName) {
      await deleteModFileBestEffort(dir, prev.fileName);
    }

    await upsertRegistryEntry(dir, {
      modId: id,
      fileId: result.fileId,
      fileName: result.fileName,
      installedAt: new Date().toISOString(),
    });
    event.sender.send("mods:download-finished", { modId: id, fileId: result.fileId, fileName: result.fileName });
    return { ok: true, fileId: result.fileId, fileName: result.fileName };
  } catch (e) {
    const message = toUserFacingModsError(e);
    event.sender.send("mods:download-error", { modId: id, error: message });
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:installed:list", async (_, gameDir: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, modsDir: "", items: [], error: "Invalid gameDir" };

  try {
    const modsDir = getModsDir(dir);
    await fs.promises.mkdir(modsDir, { recursive: true });
    const files = await fs.promises.readdir(modsDir);
    const items = files
      .filter((f) => typeof f === "string" && f.trim())
      .map((f) => {
        const enabled = !f.endsWith(".disabled");
        return { fileName: f, enabled };
      })
      .sort((a, b) => a.fileName.localeCompare(b.fileName));

    return { ok: true, modsDir, items, error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, modsDir: "", items: [], error: message };
  }
});

ipcMain.handle("mods:installed:toggle", async (_, gameDir: string, fileName: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, error: "Invalid gameDir" };

  try {
    const safeName = assertSafeFileName(fileName);
    const modsDir = getModsDir(dir);
    await fs.promises.mkdir(modsDir, { recursive: true });

    const from = path.join(modsDir, safeName);
    const enabled = !safeName.endsWith(".disabled");
    const to = enabled ? `${from}.disabled` : from.replace(/\.disabled$/i, "");
    await fs.promises.rename(from, to);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:installed:delete", async (_, gameDir: string, fileName: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, error: "Invalid gameDir" };

  try {
    const safeName = assertSafeFileName(fileName);
    const modsDir = getModsDir(dir);
    const target = path.join(modsDir, safeName);
    await fs.promises.unlink(target);

    // Best-effort cleanup of registry entries that referenced this file.
    try {
      const existing = await readModsRegistry(dir);
      const next = existing.filter((x) => (x.fileName || "") !== safeName);
      if (next.length !== existing.length) await writeModsRegistry(dir, next);
    } catch {
      // ignore
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:file-hash", async (_, gameDir: string, fileName: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, sha256: "", error: "Invalid gameDir" };

  try {
    const safeName = assertSafeFileName(fileName);
    const modsDir = getModsDir(dir);
    const target = path.join(modsDir, safeName);

    const hash = crypto.createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const s = fs.createReadStream(target);
      s.on("data", (chunk) => hash.update(chunk));
      s.on("error", reject);
      s.on("end", () => resolve());
    });

    return { ok: true, sha256: hash.digest("hex"), error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, sha256: "", error: message };
  }
});

ipcMain.handle("mods:installed:set-all", async (_, gameDir: string, enabled: boolean) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, error: "Invalid gameDir" };

  try {
    const modsDir = getModsDir(dir);
    await fs.promises.mkdir(modsDir, { recursive: true });
    const files = await fs.promises.readdir(modsDir);

    let changed = 0;
    for (const f of files) {
      if (typeof f !== "string" || !f.trim()) continue;
      const safe = assertSafeFileName(f);
      const isEnabled = !safe.endsWith(".disabled");
      if (enabled && isEnabled) continue;
      if (!enabled && !isEnabled) continue;

      const from = path.join(modsDir, safe);
      const to = enabled
        ? path.join(modsDir, safe.replace(/\.disabled$/i, ""))
        : path.join(modsDir, `${safe}.disabled`);

      try {
        await fs.promises.rename(from, to);
        changed++;
      } catch {
        // Ignore per-file errors, because consistency is apparently optional.
      }
    }

    return { ok: true, changed };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:profiles:list", async (_, gameDir: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, profiles: [], error: "Invalid gameDir" };
  try {
    const profiles = await readProfiles(dir);
    return { ok: true, profiles };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, profiles: [], error: message };
  }
});

ipcMain.handle("mods:profiles:save", async (_, gameDir: string, profile: { name: string; mods: string[] }) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, error: "Invalid gameDir" };
  try {
    const name = assertSafeProfileName(profile?.name);
    if (name.toLowerCase() === VANILLA_PROFILE_NAME.toLowerCase()) {
      // Yes, we hard-block naming a profile "Vanilla". No, it's not negotiable.
      return { ok: false, error: "Reserved profile name" };
    }
    const mods = Array.isArray(profile?.mods) ? profile.mods.map(normalizeModBaseName) : [];
    const uniqueMods = Array.from(new Set(mods)).filter(Boolean);
    const cf = sanitizeProfileCfMap((profile as any)?.cf, uniqueMods);

    const existing = await readProfiles(dir);
    const next = existing.filter((p) => p.name.toLowerCase() !== name.toLowerCase());
    next.push({ name, mods: uniqueMods, cf });
    await writeProfiles(dir, canonicalizeProfiles(next));
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:profiles:delete", async (_, gameDir: string, name: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, error: "Invalid gameDir" };
  try {
    const safeName = assertSafeProfileName(name);
    if (safeName.toLowerCase() === VANILLA_PROFILE_NAME.toLowerCase()) {
      // If you could delete Vanilla, you absolutely would. So you can't.
      return { ok: false, error: "Cannot delete Vanilla" };
    }
    const existing = await readProfiles(dir);
    const next = existing.filter((p) => p.name.toLowerCase() !== safeName.toLowerCase());
    await writeProfiles(dir, canonicalizeProfiles(next));
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("mods:profiles:apply", async (_, gameDir: string, name: string) => {
  const dir = typeof gameDir === "string" ? gameDir.trim() : "";
  if (!dir) return { ok: false, error: "Invalid gameDir" };

  try {
    const safeName = assertSafeProfileName(name);
    const profiles = await readProfiles(dir);
    const profile = profiles.find((p) => p.name.toLowerCase() === safeName.toLowerCase());
    if (!profile) return { ok: false, error: "Profile not found" };

    const modsDir = getModsDir(dir);
    await fs.promises.mkdir(modsDir, { recursive: true });
    const files = await fs.promises.readdir(modsDir);

    // Map baseName -> { enabledPath?, disabledPath? }
    const index = new Map<
      string,
      { enabled?: string; disabled?: string }
    >();

    for (const f of files) {
      if (typeof f !== "string" || !f.trim()) continue;
      const base = f.endsWith(".disabled") ? f.slice(0, -".disabled".length) : f;
      const entry = index.get(base) ?? {};
      if (f.endsWith(".disabled")) entry.disabled = f;
      else entry.enabled = f;
      index.set(base, entry);
    }

    const desired = new Set(profile.mods);
    let enabledCount = 0;
    let disabledCount = 0;

    // Enable desired mods
    for (const base of desired) {
      const entry = index.get(base);
      if (!entry) continue;
      if (entry.enabled) continue;
      if (entry.disabled) {
        const from = path.join(modsDir, entry.disabled);
        const to = path.join(modsDir, base);
        await fs.promises.rename(from, to);
        enabledCount++;
        entry.enabled = base;
        entry.disabled = undefined;
      }
    }

    // Disable non-desired mods
    for (const [base, entry] of index.entries()) {
      if (desired.has(base)) continue;
      if (!entry.enabled) continue;
      const from = path.join(modsDir, entry.enabled);
      const to = path.join(modsDir, `${base}.disabled`);
      await fs.promises.rename(from, to);
      disabledCount++;
      entry.disabled = `${base}.disabled`;
      entry.enabled = undefined;
    }

    return { ok: true, enabledCount, disabledCount };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
});

ipcMain.handle("get-default-game-directory", () => {
  return computeDefaultGameDirectory();
});

ipcMain.handle("download-directory:get", () => {
  return getEffectiveDownloadDirectory();
});

ipcMain.handle("steamdeck-mode:get", () => {
  return getSteamDeckModeEnabled();
});

ipcMain.handle(
  "steamdeck-mode:set",
  async (_, enabled: boolean, gameDir?: string | null) => {
    try {
      const nextEnabled = enabled === true;
      writeLauncherSettings({ ...readLauncherSettings(), steamDeckMode: nextEnabled });

      const dir = typeof gameDir === "string" && gameDir.trim() ? gameDir.trim() : getEffectiveDownloadDirectory();

      const result = applySteamDeckModeAcrossInstalled(dir, nextEnabled);
      return { ...result, ok: true, enabled: nextEnabled };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, enabled: enabled === true, message };
    }
  },
);

ipcMain.handle("download-directory:select", async () => {
  if (!win) return { ok: false, path: null as string | null, error: "Window not ready" };

  try {
    const current = getEffectiveDownloadDirectory();

    const result = await dialog.showOpenDialog(win, {
      title: "Select Download Directory",
      defaultPath: current,
      properties: ["openDirectory", "createDirectory"],
    });

    if (result.canceled || !result.filePaths?.length) {
      return { ok: true, path: null as string | null, error: null as string | null };
    }

    const selected = result.filePaths[0];
    if (!isUsableDirectory(selected)) {
      return { ok: false, path: null as string | null, error: "Invalid directory" };
    }

    writeLauncherSettings({ ...readLauncherSettings(), downloadDirectory: selected });
    return { ok: true, path: selected, error: null as string | null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, path: null as string | null, error: message };
  }
});

ipcMain.handle(
  "dialog:pick-folder",
  async (_, payload?: { title?: string; defaultPath?: string }) => {
    if (!win) return { ok: false, path: null as string | null, error: "Window not ready" };

    try {
      const title = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "Select Folder";
      const defaultPath = typeof payload?.defaultPath === "string" && payload.defaultPath.trim() ? payload.defaultPath.trim() : undefined;

      const result = await dialog.showOpenDialog(win, {
        title,
        defaultPath,
        properties: ["openDirectory", "createDirectory"],
      });

      if (result.canceled || !result.filePaths?.length) {
        return { ok: true, path: null as string | null, error: null as string | null };
      }

      const selected = result.filePaths[0];
      return { ok: true, path: selected, error: null as string | null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, path: null as string | null, error: message };
    }
  },
);

ipcMain.handle(
  "dialog:pick-file",
  async (_, payload?: { title?: string; defaultPath?: string; extensions?: string[] }) => {
    if (!win) return { ok: false, path: null as string | null, error: "Window not ready" };

    try {
      const title = typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : "Select File";
      const defaultPath = typeof payload?.defaultPath === "string" && payload.defaultPath.trim() ? payload.defaultPath.trim() : undefined;
      const extensions = Array.isArray(payload?.extensions)
        ? payload!.extensions.map((x) => String(x ?? "").replace(/^\./, "").trim()).filter(Boolean)
        : [];

      const filters = extensions.length
        ? [{ name: extensions.join(", "), extensions }]
        : undefined;

      const result = await dialog.showOpenDialog(win, {
        title,
        defaultPath,
        properties: ["openFile"],
        filters,
      });

      if (result.canceled || !result.filePaths?.length) {
        return { ok: true, path: null as string | null, error: null as string | null };
      }

      const selected = result.filePaths[0];
      return { ok: true, path: selected, error: null as string | null };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, path: null as string | null, error: message };
    }
  },
);

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
      "updates.butterlauncher.tech",
      "butterlauncher.tech",
      "www.butterlauncher.tech",
      "launcher.hytale.com",
      "hytale.com",
      "www.hytale.com",
      "github.com",
      "www.github.com",
      "instagram.com",
      "www.instagram.com",
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
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
  "support-ticket:collect",
  async (
    _,
    username: string,
    customUUID?: string | null,
  ): Promise<
    | {
        ok: true;
        username: string;
        uuid: string;
        logs: Array<{
          group: "launcher" | "client" | "server";
          relPath: string;
          fileName: string;
          mtimeMs: number;
          size: number;
          truncated: boolean;
          content: string;
        }>;
      }
    | { ok: false; error: string }
  > => {
    try {
      const safeUser = typeof username === "string" ? username.trim() : "";
      if (!safeUser) return { ok: false, error: "Missing username" };

      const uuid =
        typeof customUUID === "string" && customUUID.trim()
          ? customUUID.trim()
          : genUUID(safeUser);

      const userDataRoot = app.getPath("userData");
      const targets: Array<{
        group: "launcher" | "client" | "server";
        dir: string;
      }> = [
        { group: "launcher", dir: LOGS_DIRECTORY },
        {
          group: "client",
          dir: path.join(META_DIRECTORY, "Hytale", "UserData", "Logs"),
        },
        {
          group: "server",
          dir: path.join(
            META_DIRECTORY,
            "Hytale",
            "game",
            "latest",
            "Server",
            "logs",
          ),
        },
      ];

      const readTailUtf8 = async (filePath: string, maxBytes: number) => {
        const st = await fs.promises.stat(filePath);
        const size = typeof st.size === "number" ? st.size : 0;
        const start = Math.max(0, size - maxBytes);
        const len = Math.max(0, size - start);

        const handle = await fs.promises.open(filePath, "r");
        try {
          const buf = Buffer.alloc(len);
          if (len > 0) {
            await handle.read(buf, 0, len, start);
          }
          return {
            text: buf.toString("utf8"),
            truncated: start > 0,
            size,
          };
        } finally {
          await handle.close();
        }
      };

      const logs: Array<{
        group: "launcher" | "client" | "server";
        relPath: string;
        fileName: string;
        mtimeMs: number;
        size: number;
        truncated: boolean;
        content: string;
      }> = [];

      for (const t of targets) {
        let dirents: fs.Dirent[] = [];
        try {
          dirents = await fs.promises.readdir(t.dir, { withFileTypes: true });
        } catch {
          continue;
        }

        const files = dirents
          .filter((d) => d.isFile())
          .map((d) => d.name)
          .filter((name) => typeof name === "string" && !!name.trim());

        const fileStats = await Promise.all(
          files.map(async (name) => {
            const p = path.join(t.dir, name);
            try {
              const st = await fs.promises.stat(p);
              return {
                name,
                path: p,
                mtimeMs: st.mtimeMs || 0,
                size: st.size || 0,
              };
            } catch {
              return null;
            }
          }),
        );

        const picked = fileStats
          .filter(Boolean)
          .sort((a, b) => (b!.mtimeMs || 0) - (a!.mtimeMs || 0))
          .slice(0, 3) as Array<{ name: string; path: string; mtimeMs: number; size: number }>;

        for (const f of picked) {
          try {
            const tail = await readTailUtf8(f.path, 512 * 1024);
            const relPath = path
              .relative(userDataRoot, f.path)
              .split(path.sep)
              .join("/");

            logs.push({
              group: t.group,
              relPath,
              fileName: f.name,
              mtimeMs: f.mtimeMs,
              size: tail.size,
              truncated: tail.truncated,
              content: tail.text,
            });
          } catch {
            // ignore individual file errors
          }
        }
      }

      return { ok: true, username: safeUser, uuid, logs };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      return { ok: false, error: message };
    }
  },
);

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
  "host-server:start",
  async (
    e,
    gameDir: string,
    version: GameVersion,
    opts?: {
      assetsZipPath?: string | null;
      authMode?: "offline" | "authenticated" | "insecure";
      noAot?: boolean;
      ramMinGb?: number | null;
      ramMaxGb?: number | null;
    },
  ): Promise<HostServerStartResult> => {
    const win = BrowserWindow.fromWebContents(e.sender);

    if (hostServerProc && !hostServerProc.killed) {
      return { ok: false, error: { code: "ALREADY_RUNNING", message: "Host server is already running" } };
    }

    if (!gameDir || typeof gameDir !== "string") {
      return { ok: false, error: { code: "BAD_ARGS", message: "Missing gameDir" } };
    }

    // Java 25 requirement
    const java = await checkJava25();
    if (!java.ok) {
      return {
        ok: false,
        error: {
          code: java.code,
          message:
            java.code === "JAVA_NOT_FOUND"
              ? "Java not found"
              : java.code === "JAVA_TOO_OLD"
                ? `Java too old (found ${java.major})`
                : "Failed to check Java",
          details: { raw: java.raw, major: (java as any).major, execPath: (java as any).execPath },
        },
      };
    }

    let installDir: string;
    try {
      installDir = resolveExistingInstallDir(gameDir, version);
    } catch (err) {
      return { ok: false, error: { code: "RESOLVE_FAILED", message: String(err) } };
    }

    const serverDir = path.join(installDir, "Server");
    const jarPath = path.join(serverDir, "HytaleServer.jar");
    if (!fs.existsSync(serverDir)) {
      return { ok: false, error: { code: "SERVER_DIR_MISSING", message: `Missing Server directory: ${serverDir}` } };
    }
    if (!fs.existsSync(jarPath)) {
      return { ok: false, error: { code: "SERVER_JAR_MISSING", message: `Missing HytaleServer.jar: ${jarPath}` } };
    }

    const customAssetsRaw = typeof opts?.assetsZipPath === "string" ? opts.assetsZipPath.trim() : "";
    const defaultAssetsPath = path.join(installDir, "Assets.zip");

    const customAssetsPath = customAssetsRaw
      ? (path.isAbsolute(customAssetsRaw)
          ? customAssetsRaw
          : path.resolve(installDir, customAssetsRaw))
      : "";

    // If a custom assets zip is provided, pass its full path to the server.
    const assetsArg = customAssetsPath
      ? customAssetsPath
      : process.platform === "win32"
        ? "..\\Assets.zip"
        : "../Assets.zip";

    const assetsToCheck = customAssetsPath ? customAssetsPath : defaultAssetsPath;
    if (!fs.existsSync(assetsToCheck)) {
      return {
        ok: false,
        error: {
          code: "ASSETS_ZIP_MISSING",
          message: `Missing Assets.zip: ${assetsToCheck}`,
          details: { assetsPath: assetsToCheck },
        },
      };
    }

    const args: string[] = [];

    const ramMin = opts?.ramMinGb;
    const ramMax = opts?.ramMaxGb;
    if (ramMin != null || ramMax != null) {
      const min = typeof ramMin === "number" ? ramMin : NaN;
      const max = typeof ramMax === "number" ? ramMax : NaN;
      if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0 || max < min) {
        return {
          ok: false,
          error: {
            code: "BAD_RAM",
            message: "Invalid RAM settings",
            details: { ramMinGb: ramMin, ramMaxGb: ramMax },
          },
        };
      }
      args.push(`-Xms${Math.floor(min)}G`, `-Xmx${Math.floor(max)}G`);
    }

    if (!opts?.noAot) {
      args.push("-XX:AOTCache=HytaleServer.aot");
    }
    args.push("-jar", "HytaleServer.jar", "--assets", assetsArg);

    const authMode = opts?.authMode;
    if (authMode === "offline" || authMode === "authenticated" || authMode === "insecure") {
      args.push("--auth-mode", authMode);
    }

    logger.info("Starting host server", { serverDir, args });
    try {
      const child = spawn(java.execPath, args, {
        cwd: serverDir,
        windowsHide: true,
        shell: false,
        stdio: "pipe",
        env: { ...process.env },
      });

      hostServerProc = child;
      hostServerOwnerWindowId = win?.id ?? null;

      const pipeLines = (stream: NodeJS.ReadableStream, name: "stdout" | "stderr") => {
        const rl = readline.createInterface({ input: stream });
        rl.on("line", (line) => {
          const s = String(line ?? "");
          if (!s.trim()) return;
          // Preserve raw server output as closely as possible.
          sendHostServerEvent(win, "host-server:log", { line: s, stream: name });
        });
        return rl;
      };

      const rlOut = child.stdout ? pipeLines(child.stdout, "stdout") : null;
      const rlErr = child.stderr ? pipeLines(child.stderr, "stderr") : null;

      child.on("spawn", () => {
        sendHostServerEvent(win, "host-server:started", {
          pid: child.pid,
          serverDir,
          version: { type: version.type, build_index: version.build_index, build_name: version.build_name, isLatest: !!version.isLatest },
        });
      });

      child.on("error", (err) => {
        logger.error("Host server spawn error", err);
        sendHostServerEvent(win, "host-server:error", { code: "SPAWN_FAILED", message: String(err?.message ?? err) });
      });

      child.on("close", (code, signal) => {
        try {
          rlOut?.close();
          rlErr?.close();
        } catch {
          // ignore
        }
        hostServerProc = null;
        hostServerOwnerWindowId = null;
        sendHostServerEvent(win, "host-server:exited", { code, signal });
      });

      // Return immediately; renderer updates state on ok.
      return {
        ok: true,
        pid: child.pid ?? -1,
        serverDir,
        cmd: "java",
        args,
      };
    } catch (err) {
      hostServerProc = null;
      hostServerOwnerWindowId = null;
      return { ok: false, error: { code: "SPAWN_FAILED", message: String(err) } };
    }
  },
);

ipcMain.handle("host-server:stop", async (e): Promise<{ ok: boolean; error?: { code: string; message: string } }> => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!hostServerProc) return { ok: true };

  const pid = hostServerProc.pid;

  try {
    sendHostServerEvent(win, "host-server:log", { line: "[Launcher] Stopping server..." });
  } catch {
    // ignore
  }

  try {
    // Try graceful first.
    try {
      hostServerProc.kill();
    } catch {
      // ignore
    }

    // On Windows, ensure the full process tree is gone.
    if (process.platform === "win32" && typeof pid === "number" && pid > 0) {
      setTimeout(() => {
        try {
          if (!hostServerProc) return;
          spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
            windowsHide: true,
            shell: false,
            stdio: "ignore",
          });
        } catch {
          // ignore
        }
      }, 1500);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: { code: "STOP_FAILED", message: String(err) } };
  }
});

ipcMain.handle(
  "host-server:sync-folder",
  async (
    _e,
    gameDir: string,
    version: GameVersion,
    kind: "universe" | "mods" | "earlyplugins",
    sourceDir: string,
  ): Promise<{ ok: boolean; error?: { code: string; message: string; details?: any } }> => {
    if (hostServerProc && !hostServerProc.killed) {
      return { ok: false, error: { code: "RUNNING", message: "Stop the server before syncing folders" } };
    }

    const src = typeof sourceDir === "string" ? sourceDir.trim() : "";
    if (!src) return { ok: false, error: { code: "BAD_ARGS", message: "Missing sourceDir" } };

    let st: fs.Stats;
    try {
      st = fs.statSync(src);
    } catch {
      return { ok: false, error: { code: "SOURCE_MISSING", message: "Source folder does not exist", details: { sourceDir: src } } };
    }
    if (!st.isDirectory()) {
      return { ok: false, error: { code: "SOURCE_NOT_DIR", message: "Source is not a directory", details: { sourceDir: src } } };
    }

    let installDir: string;
    try {
      installDir = resolveExistingInstallDir(gameDir, version);
    } catch (err) {
      return { ok: false, error: { code: "RESOLVE_FAILED", message: String(err) } };
    }

    const serverDir = path.join(installDir, "Server");
    if (!fs.existsSync(serverDir)) {
      return { ok: false, error: { code: "SERVER_DIR_MISSING", message: `Missing Server directory: ${serverDir}` } };
    }

    const destDir = path.join(serverDir, kind);
    try {
      await fs.promises.rm(destDir, { recursive: true, force: true });
      await fs.promises.mkdir(destDir, { recursive: true });
      // Copy *contents* of sourceDir into destDir.
      await fs.promises.cp(src, destDir, { recursive: true, force: true });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "SYNC_FAILED",
          message: String(err),
          details: { sourceDir: src, destDir, kind },
        },
      };
    }
  },
);

ipcMain.handle(
  "host-server:command",
  async (e, command: string): Promise<{ ok: boolean; error?: { code: string; message: string } }> => {
    const win = BrowserWindow.fromWebContents(e.sender);

    if (!hostServerProc || hostServerProc.killed) {
      return { ok: false, error: { code: "NOT_RUNNING", message: "Host server is not running" } };
    }

    const cmd = typeof command === "string" ? command.trim() : "";
    if (!cmd) return { ok: true };
    if (cmd.length > 2000) {
      return { ok: false, error: { code: "TOO_LONG", message: "Command too long" } };
    }

    try {
      // Echo to console as the user typed it.
      try {
        sendHostServerEvent(win, "host-server:log", { line: `> ${cmd}`, stream: "stdin" });
      } catch {
        // ignore
      }

      hostServerProc.stdin.write(`${cmd}\n`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: { code: "WRITE_FAILED", message: String(err) } };
    }
  },
);

ipcMain.handle(
  "delete-installed-version",
  (_, baseDir: string, info: InstalledBuildInfo) => {
    try {
      if (isGameRunning && runningGameBuildKey && runningGameBuildKey === buildKey(info)) {
        return { success: false, error: "GAME_RUNNING" };
      }
      deleteInstalledVersion(baseDir, info);
      return { success: true };
    } catch (e) {
      logger.error("Failed to delete version", e);
      return { success: false, error: String(e) };
    }
  },
);

ipcMain.on(
  "install-game",
  (e, gameDir: string, version: GameVersion, accountType?: string) => {
  if (!fs.existsSync(gameDir)) {
    fs.mkdirSync(gameDir, { recursive: true });
  }

  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) {
    const isNoPremium = String(accountType ?? "").toLowerCase() === "nopremium";
    const forceFullInstall =
      isNoPremium && !!version?.isLatest;
    void ((forceFullInstall || !isNoPremium)
      ? (isNoPremium ? installGameNoPremiumFull(gameDir, version, win) : installGame(gameDir, version, win))
      : installGameNoPremium(gameDir, version, win)
    ).then((ok) => {
      if (!ok) return;
      if (process.platform !== "linux") return;
      if (!getSteamDeckModeEnabled()) return;
      try {
        const r = applySteamDeckFixForVersion(gameDir, version, true);
        if (!r.ok) logger.warn("SteamDeck fix (post-install) failed", r);
        else logger.info("SteamDeck fix (post-install) applied", r);
      } catch (err) {
        logger.warn("SteamDeck fix (post-install) threw", err);
      }
    });
  }
},
);

ipcMain.on(
  "install-game-smart",
  (
    e,
    gameDir: string,
    version: GameVersion,
    fromBuildIndex: number,
    accountType?: string,
  ) => {
    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      const isNoPremium = String(accountType ?? "").toLowerCase() === "nopremium";
      const forceFullInstall =
        isNoPremium && !!version?.isLatest;
      void (forceFullInstall
        ? installGameNoPremiumFull(gameDir, version, win)
        : isNoPremium
          ? installGameNoPremium(gameDir, version, win)
          : installGameSmart(gameDir, version, fromBuildIndex, win)
      ).then((ok) => {
        if (!ok) return;
        if (process.platform !== "linux") return;
        if (!getSteamDeckModeEnabled()) return;
        try {
          const r = applySteamDeckFixForVersion(gameDir, version, true);
          if (!r.ok) logger.warn("SteamDeck fix (post-smart-install) failed", r);
          else logger.info("SteamDeck fix (post-smart-install) applied", r);
        } catch (err) {
          logger.warn("SteamDeck fix (post-smart-install) threw", err);
        }
      });
    }
  },
);

ipcMain.on(
  "install-build1-manual",
  (e, gameDir: string, sourceDir: string, versionType?: VersionType) => {
    if (typeof gameDir !== "string" || !gameDir.trim()) return;
    if (typeof sourceDir !== "string" || !sourceDir.trim()) return;

    if (!fs.existsSync(gameDir)) {
      fs.mkdirSync(gameDir, { recursive: true });
    }

    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    const channel: VersionType =
      versionType === "pre-release" || versionType === "release"
        ? versionType
        : "release";

    const build1: GameVersion = {
      url: "",
      type: channel,
      build_index: 1,
      build_name: "Build-1",
      isLatest: false,
    };

    void installBuild1FromFolder(gameDir, sourceDir, win, channel).then((ok) => {
      if (!ok) return;
      if (process.platform !== "linux") return;
      if (!getSteamDeckModeEnabled()) return;
      try {
        const r = applySteamDeckFixForVersion(gameDir, build1, true);
        if (!r.ok) logger.warn("SteamDeck fix (post-build1-import) failed", r);
        else logger.info("SteamDeck fix (post-build1-import) applied", r);
      } catch (err) {
        logger.warn("SteamDeck fix (post-build1-import) threw", err);
      }
    });
  },
);

ipcMain.on(
  "cancel-build-download",
  (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    // cancel only the pwr download because everything else is apparently sacred
    const ok = cancelBuildDownload(gameDir, version);
    if (!ok) {
      // no spammy alerts here just a quiet no
      win.webContents.send("install-cancel-not-possible");
    }
  },
);

ipcMain.on(
  "launch-game",
  (
    e,
    gameDir: string,
    version: GameVersion,
    username: string,
    customUUID?: string | null,
    forceOfflineAuth?: boolean,
    accountType?: string,
  ) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win) {
      if (process.platform === "linux" && getSteamDeckModeEnabled()) {
        try {
          const r = applySteamDeckFixForVersion(gameDir, version, true);
          if (!r.ok) logger.warn("SteamDeck fix (pre-launch) failed", r);
        } catch (err) {
          logger.warn("SteamDeck fix (pre-launch) threw", err);
        }
      }

      // Reset any pending background transition from a previous launch attempt.
      if (backgroundTimeout) {
        clearTimeout(backgroundTimeout);
        backgroundTimeout = null;
      }

      launchGame(
        gameDir,
        version,
        username,
        win,
        0,
        customUUID ?? null,
        !!forceOfflineAuth,
        accountType ?? null,
        {
        onGameSpawned: () => {
          logger.info(`Game spawned: ${version.type} ${version.build_name}`);
          isGameRunning = true;
          runningGameBuildKey = buildKey(version);
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
          runningGameBuildKey = null;
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
        },
      );
    }
  },
);

ipcMain.on(
  "online-patch:enable",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    if (isGameRunning && runningGameBuildKey && runningGameBuildKey === buildKey(version)) {
      win.webContents.send("online-patch-error", { code: ErrorCodes.FILE_IN_USE });
      return;
    }

    const key = onlinePatchKey(gameDir, version);
    if (onlinePatchInFlight.has(key)) {
      win.webContents.send("online-patch-error", { code: ErrorCodes.OP_IN_PROGRESS });
      return;
    }
    onlinePatchInFlight.add(key);

    // Flip UI into progress state immediately (hash checks can take a moment).
    win.webContents.send("online-patch-progress", {
      phase: "online-patch",
      percent: -1,
    });

    try {
      const result = await enableOnlinePatch(
        gameDir,
        version,
        win,
        "online-patch-progress",
      );
      win.webContents.send("online-patch-finished", result);
    } catch (err) {
      const code = mapErrorToCode(err, { area: "online-patch" });
      logger.error("Online patch failed", { code }, err);
      win.webContents.send("online-patch-error", { code });
    } finally {
      onlinePatchInFlight.delete(key);
    }
  },
);

ipcMain.on(
  "online-patch:disable",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    if (isGameRunning && runningGameBuildKey && runningGameBuildKey === buildKey(version)) {
      win.webContents.send("online-unpatch-error", { code: ErrorCodes.FILE_IN_USE });
      return;
    }

    const key = onlinePatchKey(gameDir, version);
    if (onlinePatchInFlight.has(key)) {
      win.webContents.send("online-unpatch-error", { code: ErrorCodes.OP_IN_PROGRESS });
      return;
    }
    onlinePatchInFlight.add(key);

    win.webContents.send("online-unpatch-progress", {
      phase: "online-unpatch",
      percent: -1,
    });

    try {
      const result = await disableOnlinePatch(
        gameDir,
        version,
        win,
        "online-unpatch-progress",
      );
      win.webContents.send("online-unpatch-finished", result);
    } catch (err) {
      const code = mapErrorToCode(err, { area: "online-patch" });
      logger.error("Online unpatch failed", { code }, err);
      win.webContents.send("online-unpatch-error", { code });
    } finally {
      onlinePatchInFlight.delete(key);
    }
  },
);

ipcMain.on(
  "online-patch:remove",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    if (isGameRunning && runningGameBuildKey && runningGameBuildKey === buildKey(version)) {
      win.webContents.send("online-unpatch-error", { code: ErrorCodes.FILE_IN_USE });
      return;
    }

    const key = onlinePatchKey(gameDir, version);
    if (onlinePatchInFlight.has(key)) {
      win.webContents.send("online-unpatch-error", { code: ErrorCodes.OP_IN_PROGRESS });
      return;
    }
    onlinePatchInFlight.add(key);

    win.webContents.send("online-unpatch-progress", {
      phase: "online-unpatch",
      percent: -1,
    });

    try {
      const result = await removeOnlinePatch(
        gameDir,
        version,
        win,
        "online-unpatch-progress",
      );
      win.webContents.send("online-unpatch-finished", result);
    } catch (err) {
      const code = mapErrorToCode(err, { area: "online-patch" });
      logger.error("Online patch removal failed", { code }, err);
      win.webContents.send("online-unpatch-error", { code });
    } finally {
      onlinePatchInFlight.delete(key);
    }
  },
);

ipcMain.on(
  "online-patch:fix-client",
  async (e, gameDir: string, version: GameVersion) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;

    if (isGameRunning && runningGameBuildKey && runningGameBuildKey === buildKey(version)) {
      win.webContents.send("online-unpatch-error", { code: ErrorCodes.FILE_IN_USE });
      return;
    }

    const key = onlinePatchKey(gameDir, version);
    if (onlinePatchInFlight.has(key)) {
      win.webContents.send("online-unpatch-error", { code: ErrorCodes.OP_IN_PROGRESS });
      return;
    }
    onlinePatchInFlight.add(key);

    win.webContents.send("online-unpatch-progress", {
      phase: "online-unpatch",
      percent: -1,
    });

    try {
      const result = await fixClientToUnpatched(
        gameDir,
        version,
        win,
        "online-unpatch-progress",
      );
      win.webContents.send("online-unpatch-finished", result);
    } catch (err) {
      const code = mapErrorToCode(err, { area: "online-patch" });
      logger.error("Fix client (unpatch) failed", { code }, err);
      win.webContents.send("online-unpatch-error", { code });
    } finally {
      onlinePatchInFlight.delete(key);
    }
  },
);
