import { BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import { promisify } from "util";
import stream from "stream";
import { spawn, spawnSync } from "child_process";
import readline from "node:readline";

// Installer logic: a love letter to edge-cases and slow I/O.
import { installButler } from "./butler";
import { installJRE } from "./jre";
import { checkGameInstallation } from "./check";
import {
  INSTALLED_MANIFEST_FILENAME,
  readInstallManifest,
  writeInstallManifest,
} from "./manifest";
import { logger } from "../logger";
import { formatErrorWithHints } from "../errorHints";
import { mapErrorToCode } from "../errorCodes";
import { listInstalledVersions } from "./installed";
import { META_DIRECTORY } from "../const";

import {
  getLatestDir,
  getReleaseBuildDir,
  migrateLegacyChannelInstallIfNeeded,
  resolveClientPath,
  resolveExistingInstallDir,
  resolveInstallDir,
  resolveServerPath,
} from "./paths";

const ONLINE_PATCH_ROOT_DIRNAME = ".butter-online-patch";

const pipeline = promisify(stream.pipeline);

const shouldKeepFailedPWRs = () => {
  // Default: delete failed PWRs to avoid leaving multi-GB leftovers.
  // Set BUTTER_KEEP_FAILED_PWRS=1 to keep them for debugging.
  return String(process.env.BUTTER_KEEP_FAILED_PWRS || "").trim() === "1";
};

const safeUnlink = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
};

const safeRmDir = (dirPath: string) => {
  try {
    if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const replaceDirAtomically = (stagingDir: string, finalDir: string) => {
  // Attempt to keep previous install intact until the very end.
  // If finalDir exists, move it aside; if swap fails, attempt to restore.
  const backupDir = `${finalDir}.backup-${Date.now()}`;

  if (fs.existsSync(finalDir)) {
    try {
      fs.renameSync(finalDir, backupDir);
    } catch {
      // If rename fails (locked files), fall back to delete.
      safeRmDir(finalDir);
    }
  }

  try {
    fs.renameSync(stagingDir, finalDir);
  } catch (e) {
    // Best-effort restore.
    try {
      if (fs.existsSync(backupDir) && !fs.existsSync(finalDir)) {
        fs.renameSync(backupDir, finalDir);
      }
    } catch {
      // ignore
    }
    throw e;
  }

  // Cleanup backup after successful swap.
  safeRmDir(backupDir);
};

const safeStat = (filePath: string): { size: number; mtimeMs: number } | null => {
  try {
    const st = fs.statSync(filePath);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
};

const readHexSnippet = (filePath: string, offset: number, length: number): string | null => {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(length);
      const bytes = fs.readSync(fd, buf, 0, length, offset);
      return buf.subarray(0, bytes).toString("hex");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
};

const sha256File = (filePath: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
};

let cachedButlerVersion: string | null = null;
const getButlerVersionOnce = (butlerPath: string): string => {
  if (cachedButlerVersion) return cachedButlerVersion;
  try {
    const r = spawnSync(butlerPath, ["--version"], {
      windowsHide: true,
      encoding: "utf8",
    });
    const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
    cachedButlerVersion = out || `exit=${r.status ?? "?"}`;
  } catch (e) {
    cachedButlerVersion = `version_check_failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return cachedButlerVersion;
};

// we track only the pwr download because users love cancel buttons
// and because canceling patching would be too reasonable
class UserCancelledError extends Error {
  constructor() {
    super("user_cancelled");
    this.name = "UserCancelledError";
  }
}

type PwrDownloadState = {
  controller: AbortController;
  tempPath: string;
};

const pwrDownloadsInFlight = new Map<string, PwrDownloadState>();

const installKey = (gameDir: string, version: GameVersion) =>
  `${gameDir}::${version.type}::${version.build_index}`;

export const cancelBuildDownload = (
  gameDir: string,
  version: GameVersion,
): boolean => {
  const key = installKey(gameDir, version);
  const direct = pwrDownloadsInFlight.get(key);
  const st = direct
    ? direct
    : // Fallback: smart-chain installs download intermediate steps under different build_index.
      // Abort any in-flight download for the same gameDir + channel.
      Array.from(pwrDownloadsInFlight.entries()).find(([k]) =>
        k.startsWith(`${gameDir}::${version.type}::`),
      )?.[1];
  if (!st) return false;

  try {
    st.controller.abort();
  } catch {
    // ignore
  }

  // best effort cleanup of partial file
  try {
    if (fs.existsSync(st.tempPath)) fs.unlinkSync(st.tempPath);
  } catch {
    // ignore
  }

  return true;
};

type PatchStep = {
  from: number;
  to: number;
  pwr: string;
  pwrHead?: string;
  sig?: string;
};

type PatchPlanResponse = {
  steps: PatchStep[];
};

const PREMIUM_AUTH_FILE = path.join(META_DIRECTORY, "premium-auth.json");

const readPremiumAccessTokenBestEffort = (): string | null => {
  try {
    if (!fs.existsSync(PREMIUM_AUTH_FILE)) return null;
    const raw = fs.readFileSync(PREMIUM_AUTH_FILE, "utf8");
    const parsed: any = JSON.parse(raw);
    const tok = parsed?.token?.access_token;
    if (typeof tok !== "string") return null;
    const trimmed = tok.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
};

const buildPremiumHytaleHeaders = (accessToken: string): Record<string, string> => {
  const userAgent = String(process.env.HYTALE_OAUTH_USER_AGENT ?? "").trim();
  const launcherBranch = String(process.env.HYTALE_OAUTH_LAUNCHER_BRANCH ?? "").trim();
  const launcherVersion = String(process.env.HYTALE_OAUTH_LAUNCHER_VERSION ?? "").trim();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    // Some responses are gzip by default; make it explicit.
    "Accept-Encoding": "gzip",
  };

  if (userAgent) headers["User-Agent"] = userAgent;
  if (launcherBranch) headers["X-Hytale-Launcher-Branch"] = launcherBranch;
  if (launcherVersion) headers["X-Hytale-Launcher-Version"] = launcherVersion;

  return headers;
};

const getApiOs = (): "windows" | "linux" | "darwin" => {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "darwin";
  return "linux";
};

const getApiArch = (): "amd64" | "arm64" => {
  // The API says "amd64" for win/linux and "arm64" for macOS, so we nod and comply.
  if (process.platform === "darwin") return "arm64";
  return "amd64";
};

const computeHmacSha256Hex = (secret: string, message: string): string => {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
};

const fetchPatchPlanNoPremium = async (opts: {
  branch: VersionType;
  currentVersion: number;
}): Promise<PatchStep[]> => {
  const secret = String(process.env.LAUNCHER_SECRET_KEY ?? "").trim();
  if (!secret) {
    throw new Error(
      "Missing LAUNCHER_SECRET_KEY (expected in .env.local or injected by CI).",
    );
  }

  const timestamp = Date.now();
  const message = `${opts.branch}${opts.currentVersion}${timestamp}`;
  const signature = computeHmacSha256Hex(secret, message);

  const payload = {
    os: getApiOs(),
    arch: getApiArch(),
    branch: opts.branch,
    current_version: opts.currentVersion,
    timestamp,
    signature,
  };

  const url = "https://butter.lat/api/client/get-patch";

  let json: PatchPlanResponse;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(
        `get-patch failed (HTTP ${res.status})` +
          (snippet ? `: ${snippet}` : ""),
      );
    }
    json = (await res.json()) as PatchPlanResponse;
  } catch (e) {
    const { userMessage, meta } = formatErrorWithHints(e, {
      op: "Fetch patch plan",
      url,
    });
    logger.error("Failed to fetch patch plan", meta, e);
    throw new Error(userMessage);
  }

  const steps = Array.isArray(json?.steps) ? json.steps : [];
  const normalized = steps
    .map((s) => {
      const from = Number((s as any)?.from);
      const to = Number((s as any)?.to);
      const pwr = String((s as any)?.pwr ?? "").trim();
      const pwrHeadRaw = (s as any)?.pwrHead;
      const sigRaw = (s as any)?.sig;
      const pwrHead =
        typeof pwrHeadRaw === "string" && pwrHeadRaw.trim()
          ? pwrHeadRaw.trim()
          : undefined;
      const sig =
        typeof sigRaw === "string" && sigRaw.trim() ? sigRaw.trim() : undefined;
      if (!Number.isFinite(from) || !Number.isFinite(to) || !pwr) return null;
      return { from, to, pwr, pwrHead, sig } satisfies PatchStep;
    })
    .filter(Boolean) as PatchStep[];

  if (!normalized.length) {
    throw new Error("get-patch returned no usable steps.");
  }

  return normalized;
};

const fetchPatchPlanPremium = async (opts: {
  branch: VersionType;
  currentVersion: number;
}): Promise<{ steps: PatchStep[]; headers: Record<string, string> }> => {
  const accessToken = readPremiumAccessTokenBestEffort();
  if (!accessToken) {
    throw new Error("Premium login required (missing access token).");
  }

  const os = getApiOs();
  const arch = getApiArch();
  const branch = opts.branch === "pre-release" ? "pre-release" : "release";
  const from = Number(opts.currentVersion);
  if (!Number.isFinite(from) || from < 0) {
    throw new Error("Invalid base build index for premium patch plan.");
  }

  const url = `https://account-data.hytale.com/patches/${os}/${arch}/${branch}/${from}`;
  const headers = buildPremiumHytaleHeaders(accessToken);

  let json: PatchPlanResponse;
  try {
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      const snippet = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(
        `official patches failed (HTTP ${res.status})` +
          (snippet ? `: ${snippet}` : ""),
      );
    }
    json = (await res.json()) as PatchPlanResponse;
  } catch (e) {
    const { userMessage, meta } = formatErrorWithHints(e, {
      op: "Fetch premium patch plan",
      url,
    });
    logger.error("Failed to fetch premium patch plan", meta, e);
    throw new Error(userMessage);
  }

  const steps = Array.isArray((json as any)?.steps) ? (json as any).steps : [];
  const normalized = steps
    .map((s: any) => {
      const from = Number(s?.from);
      const to = Number(s?.to);
      const pwr = String(s?.pwr ?? "").trim();
      const pwrHeadRaw = s?.pwrHead;
      const sigRaw = s?.sig;
      const pwrHead =
        typeof pwrHeadRaw === "string" && pwrHeadRaw.trim()
          ? pwrHeadRaw.trim()
          : undefined;
      const sig = typeof sigRaw === "string" && sigRaw.trim() ? sigRaw.trim() : undefined;
      if (!Number.isFinite(from) || !Number.isFinite(to) || !pwr) return null;
      return { from, to, pwr, pwrHead, sig } satisfies PatchStep;
    })
    .filter(Boolean) as PatchStep[];

  if (!normalized.length) {
    throw new Error("Official patch plan returned no usable steps.");
  }

  return { steps: normalized, headers };
};

const pickBestInstalledBaseForTarget = (
  gameDir: string,
  versionType: VersionType,
  targetBuildIndex: number,
): number => {
  const installed = listInstalledVersions(gameDir)
    .filter((x) => x.type === versionType)
    .map((x) => Number(x.build_index))
    .filter((n) => Number.isFinite(n) && n > 0 && n < targetBuildIndex)
    .sort((a, b) => b - a);

  // Prefer the newest *complete* build below target (because partial installs are a lifestyle choice).
  for (const idx of installed) {
    const candidate: GameVersion = {
      url: "",
      type: versionType,
      build_index: idx,
      build_name: `Build-${idx}`,
      isLatest: false,
    };
    const { client, server } = checkGameInstallation(gameDir, candidate);
    if (client && server) return idx;
  }

  return 0;
};

const buildPatchChainToTarget = (
  steps: PatchStep[],
  base: number,
  target: number,
): PatchStep[] => {
  const byFrom = new Map<number, PatchStep[]>();
  for (const s of steps) {
    if (!Number.isFinite(s.from) || !Number.isFinite(s.to)) continue;
    // Allow base=0 (full install) steps.
    if (s.from < 0 || s.to <= 0) continue;
    if (s.to <= s.from) continue;
    const arr = byFrom.get(s.from) ?? [];
    arr.push(s);
    byFrom.set(s.from, arr);
  }

  // Prefer bigger hops (fewer steps), but never overshoot target.
  for (const [k, arr] of byFrom.entries()) {
    arr.sort((a, b) => b.to - a.to);
    byFrom.set(k, arr);
  }

  const chain: PatchStep[] = [];
  let cur = base;
  const maxHops = 1024;

  for (let i = 0; i < maxHops && cur < target; i++) {
    const options = byFrom.get(cur) ?? [];
    const next = options.find((s) => s.to <= target);
    if (!next) break;
    chain.push(next);
    cur = next.to;
  }

  if (!chain.length || chain[chain.length - 1]!.to !== target) {
    throw new Error(
      `Patch plan did not contain a usable chain from ${base} to ${target}.`,
    );
  }

  return chain;
};

const installGameFromPatchPlan = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  opts?: {
    baseOverride?: number;
    label?: string;
    patchPlan:
      | { kind: "nopremium" }
      | { kind: "premium" };
  },
) => {
  const label = opts?.label ? String(opts.label) : "PATCH-PLAN";
  logger.info(
    `Starting ${label} installation for ${version.type} build ${version.build_name} in ${gameDir}`,
  );

  let installDirFinal: string | null = null;
  let installDirStaging: string | null = null;

  try {
    migrateLegacyChannelInstallIfNeeded(gameDir, version.type);

    // Keep legacy `latest` behavior, because backwards compatibility is forever.
    retireExistingLatestReleaseIfNeeded(gameDir, version);

    installDirFinal = resolveInstallDir(gameDir, version);
    installDirStaging = `${installDirFinal}.staging-${Date.now()}`;

    // Always patch into staging to avoid corrupting an existing install.
    safeRmDir(installDirStaging);

    fs.mkdirSync(gameDir, { recursive: true });
    win.webContents.send("install-started");

    // Ensure JRE exists (shared across builds)
    const { jre } = checkGameInstallation(gameDir, version);
    if (!jre) {
      logger.info("JRE not found, installing JRE...");
      const jreRes = await installJRE(gameDir, win);
      if (!jreRes.ok) throw new Error(jreRes.error);
      logger.info(`JRE installed at ${jreRes.path}`);
    }

    const target = version.build_index;

    let base =
      typeof opts?.baseOverride === "number" && Number.isFinite(opts.baseOverride)
        ? opts.baseOverride
        : pickBestInstalledBaseForTarget(gameDir, version.type, target);

    if (!Number.isFinite(base) || base < 0) base = 0;
    if (base >= target) base = 0;

    if (base > 0) {
      const baseVersion: GameVersion = {
        url: "",
        type: version.type,
        build_index: base,
        build_name: `Build-${base}`,
        isLatest: false,
      };

      const { client: baseClient, server: baseServer } = checkGameInstallation(
        gameDir,
        baseVersion,
      );
      if (!baseClient || !baseServer) {
        throw new Error(
          `Cannot start patch-plan install: base build ${base} is not installed or is incomplete.`,
        );
      }
    }

    let allSteps: PatchStep[] = [];
    let premiumHeaders: Record<string, string> | undefined = undefined;
    if (opts?.patchPlan?.kind === "premium") {
      const r = await fetchPatchPlanPremium({ branch: version.type, currentVersion: base });
      allSteps = r.steps;
      premiumHeaders = r.headers;
    } else {
      allSteps = await fetchPatchPlanNoPremium({ branch: version.type, currentVersion: base });
    }

    const chain = buildPatchChainToTarget(allSteps, base, target);

    const butlerRes = await installButler();
    if (!butlerRes.ok) throw new Error(butlerRes.error);

    // If we have a base build, seed from it once; otherwise apply full patch to empty dir.
    if (base > 0) {
      const baseVersion: GameVersion = {
        url: "",
        type: version.type,
        build_index: base,
        build_name: `Build-${base}`,
        isLatest: false,
      };
      const baseDir = resolveExistingInstallDir(gameDir, baseVersion);
      await seedInstallDirFromExisting(baseDir, installDirStaging, win);
    } else {
      fs.mkdirSync(installDirStaging, { recursive: true });
    }

    let current = base;
    const stepTotal = chain.length;
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i]!;
      if (step.from !== current) {
        throw new Error(
          `Patch chain mismatch: expected from=${current} but got ${step.from} -> ${step.to}.`,
        );
      }

      const stepMeta = { stepIndex: i + 1, stepTotal };

      const stepVersion: GameVersion = {
        ...version,
        isLatest: false,
        build_index: step.to,
        build_name: `Build-${step.to}`,
        url: step.pwr,
      };
      (stepVersion as any).pwrHead = step.pwrHead;
      (stepVersion as any).sig = step.sig;

      sanitizeSeededInstallDirForSmartPatch(installDirStaging);

      const tempPWRPath = await downloadPWR(
        gameDir,
        stepVersion,
        win,
        stepMeta,
        premiumHeaders,
      );
      try {
        const gameFinalDir = await applyPWR(
          tempPWRPath,
          butlerRes.path,
          installDirStaging,
          win,
          stepMeta,
        );
        if (!gameFinalDir) throw new Error("Failed to apply PWR");

        // Minimal sanity check: ensure we still have required binaries after the apply.
        const clientPath = resolveClientPath(installDirStaging);
        const serverPath = resolveServerPath(installDirStaging);
        if (!fs.existsSync(clientPath) || !fs.existsSync(serverPath)) {
          throw new Error(
            "Patch produced an incomplete install (missing client/server binaries).",
          );
        }

        safeUnlink(tempPWRPath);
      } catch (e) {
        if (!shouldKeepFailedPWRs()) {
          safeUnlink(tempPWRPath);
        }
        throw e;
      }

      current = step.to;
    }

    writeInstallManifest(installDirStaging, version);
    ensureClientExecutable(installDirStaging);

    replaceDirAtomically(installDirStaging, installDirFinal);

    win.webContents.send("install-finished", version);
    return true;
  } catch (error) {
    if (error instanceof UserCancelledError) {
      logger.info(`${label} install cancelled by user`);
      if (installDirStaging) safeRmDir(installDirStaging);
      win.webContents.send("install-cancelled");
      return false;
    }

    if (installDirStaging) safeRmDir(installDirStaging);
    safeUnlink(path.join(gameDir, `temp_${version.build_index}.pwr`));

    const code = mapErrorToCode(error, { area: "install" });
    logger.error(`${label} installation failed`, { code }, error);
    win.webContents.send("install-error", { code });
    return false;
  }
};

export const installGameNoPremium = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  logger.info(
    `Starting NO-PREMIUM installation for ${version.type} build ${version.build_name} in ${gameDir}`,
  );

  let targetDirFinal: string | null = null;
  let targetDirStaging: string | null = null;

  try {
    migrateLegacyChannelInstallIfNeeded(gameDir, version.type);

    // Keep legacy `latest` behavior, because backwards compatibility is forever.
    retireExistingLatestReleaseIfNeeded(gameDir, version);

    fs.mkdirSync(gameDir, { recursive: true });
    win.webContents.send("install-started");

    targetDirFinal = resolveInstallDir(gameDir, version);
    targetDirStaging = `${targetDirFinal}.staging-${Date.now()}`;

    // Ensure JRE exists (shared across builds, shared across our collective pain).
    const { jre } = checkGameInstallation(gameDir, version);
    if (!jre) {
      logger.info("JRE not found, installing JRE...");
      const jreRes = await installJRE(gameDir, win);
      if (!jreRes.ok) throw new Error(jreRes.error);
      logger.info(`JRE installed at ${jreRes.path}`);
    }

    const target = version.build_index;

    // Policy time: No Premium must have Build-1 installed before anything else.
    // Build-1 itself is allowed, because we still want *someone* to be able to install something.
    if (target !== 1) {
      const build1: GameVersion = {
        url: "",
        type: version.type,
        build_index: 1,
        build_name: "Build-1",
        isLatest: false,
      };
      const { client: b1c, server: b1s } = checkGameInstallation(gameDir, build1);
      if (!b1c || !b1s) {
        // Exception: allow installing the latest build even if Build-1 isn't present.
        // This keeps the UX simple: latest should always be downloadable.
        if (version.isLatest) {
          logger.info(
            "No Premium: Build-1 missing, but target is latest -> falling back to full PWR install.",
            { target },
          );
          return await installGameNoPremiumFull(gameDir, version, win);
        }

        throw new Error(
          "No Premium: you must install Build-1 before downloading other versions.",
        );
      }
    }

    let base = pickBestInstalledBaseForTarget(gameDir, version.type, target);

    // If Build-1 exists, base should never be 0 for target>1.
    // This keeps server behavior consistent and avoids "0 -> latest" plans.
    if (target !== 1 && (!Number.isFinite(base) || base <= 0)) base = 1;

    const baseVersion: GameVersion = {
      ...version,
      isLatest: false,
      build_index: base,
      build_name: `Build-${base}`,
      url: "",
    };

    const { client: baseClient, server: baseServer } = checkGameInstallation(
      gameDir,
      baseVersion,
    );
    if (!baseClient || !baseServer) {
      throw new Error(
        `Cannot start smart install: base build ${base} is not installed or is incomplete.`,
      );
    }

    const allSteps = await fetchPatchPlanNoPremium({
      branch: version.type,
      currentVersion: base,
    });

    const chain = buildPatchChainToTarget(allSteps, base, target);

    // Always work in a staging dir so failures never corrupt an existing install.
    safeRmDir(targetDirStaging);
    const butlerRes = await installButler();
    if (!butlerRes.ok) throw new Error(butlerRes.error);

    // Seed the target directory from base once; apply all diffs in-place.
    const baseDir = resolveExistingInstallDir(gameDir, baseVersion);
    await seedInstallDirFromExisting(baseDir, targetDirStaging, win);

    const assertPatchedTreeLooksSane = () => {
      // Minimal sanity check: after each step we should still have client + server.
      // This avoids reporting success when the resulting tree is obviously broken.
      const clientPath = resolveClientPath(targetDirStaging!);
      const serverPath = resolveServerPath(targetDirStaging!);
      if (!fs.existsSync(clientPath) || !fs.existsSync(serverPath)) {
        throw new Error(
          "Differential patch produced an incomplete install (missing client/server binaries).",
        );
      }
    };

    let current = base;
    const stepTotal = chain.length;
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i]!;
      if (step.from !== current) {
        throw new Error(
          `Patch chain mismatch: expected from=${current} but got ${step.from} -> ${step.to}.`,
        );
      }

      const stepMeta = { stepIndex: i + 1, stepTotal };

      const stepVersion: GameVersion = {
        ...version,
        isLatest: false,
        build_index: step.to,
        build_name: `Build-${step.to}`,
        url: step.pwr,
      };

      // Carry integrity metadata through (used by downloadPWR best-effort checks).
      (stepVersion as any).pwrHead = step.pwrHead;
      (stepVersion as any).sig = step.sig;

      // Smart-install semantics: ensure the working tree is pristine-ish before each apply.
      // (Important if the base build had online patch artifacts or if a previous step was interrupted.)
      sanitizeSeededInstallDirForSmartPatch(targetDirStaging);

      const tempPWRPath = await downloadPWR(gameDir, stepVersion, win, stepMeta);
      try {
        const gameFinalDir = await applyPWR(
          tempPWRPath,
          butlerRes.path,
          targetDirStaging,
          win,
          stepMeta,
        );
        if (!gameFinalDir) throw new Error("Failed to apply PWR");

        assertPatchedTreeLooksSane();

        safeUnlink(tempPWRPath);
      } catch (e) {
        if (!shouldKeepFailedPWRs()) {
          safeUnlink(tempPWRPath);
        }
        throw e;
      }

      current = step.to;
    }

    // Finalize metadata for the target build.
    writeInstallManifest(targetDirStaging, version);
    ensureClientExecutable(targetDirStaging);

    replaceDirAtomically(targetDirStaging, targetDirFinal);

    win.webContents.send("install-finished", version);
    return true;
  } catch (error) {
    if (error instanceof UserCancelledError) {
      logger.info("No Premium install cancelled by user");
      if (targetDirStaging) safeRmDir(targetDirStaging);
      win.webContents.send("install-cancelled");
      return false;
    }

    // Aggressive cleanup of partial installs.
    if (targetDirStaging) safeRmDir(targetDirStaging);

    const code = mapErrorToCode(error, { area: "install" });
    logger.error("No Premium installation failed", { code }, error);
    win.webContents.send("install-error", { code });
    return false;
  }
};

const ensureExecutable = (filePath: string) => {
  if (process.platform === "win32") return;
  try {
    const st = fs.statSync(filePath);
    if ((st.mode & 0o100) === 0) {
      fs.chmodSync(filePath, 0o755);
    }
  } catch {
    // ignore
  }
};

const ensureClientExecutable = (installDir: string) => {
  try {
    const clientPath = resolveClientPath(installDir);
    ensureExecutable(clientPath);
  } catch {
    // ignore
  }
};

// manifest helpers live in ./manifest

const downloadPWR = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  stepMeta?: { stepIndex: number; stepTotal: number },
  extraHeaders?: Record<string, string>,
) => {
  const tempPWRPath = path.join(gameDir, `temp_${version.build_index}.pwr`);
  const key = installKey(gameDir, version);
  const controller = new AbortController();

  // yes this is global state and yes it will haunt us later
  pwrDownloadsInFlight.set(key, { controller, tempPath: tempPWRPath });

  try {
    logger.info(
      `Starting PWR download for version ${version.build_name} from ${version.url}`,
    );

    // Best-effort: if we have a separate HEAD URL (signed/verified CDN links sometimes do),
    // use it to validate reachability before streaming the full file.
    try {
      const headUrl = typeof (version as any)?.pwrHead === "string" ? String((version as any).pwrHead).trim() : "";
      if (headUrl) {
        const headRes = await fetch(headUrl, {
          method: "HEAD",
          signal: controller.signal,
          headers: extraHeaders,
        });
        if (!headRes.ok) {
          throw new Error(`PWR head check failed (HTTP ${headRes.status})`);
        }
      }
    } catch (e) {
      // If HEAD fails, still try GET (some hosts block HEAD). But log it for debugging.
      logger.warn(
        `PWR head check failed (continuing with GET): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const startedAt = Date.now();
    const response = await fetch(version.url, {
      signal: controller.signal,
      headers: extraHeaders,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.body) throw new Error("No response body");

    const contentType = response.headers.get("content-type") || undefined;
    const contentEncoding = response.headers.get("content-encoding") || undefined;
    const etag = response.headers.get("etag") || undefined;
    const lastModified = response.headers.get("last-modified") || undefined;
    const acceptRanges = response.headers.get("accept-ranges") || undefined;

    const contentLength = response.headers.get("content-length");
    const totalLength = contentLength ? parseInt(contentLength, 10) : undefined;
    let downloadedLength = 0;

    logger.info(
      `PWR size: ${totalLength ? (totalLength / 1024 / 1024).toFixed(2) + " MB" : "unknown"}`,
    );
    logger.info(
      `PWR headers: content-type=${contentType ?? "unknown"} content-encoding=${contentEncoding ?? "none"} etag=${etag ?? "none"} last-modified=${lastModified ?? "none"} accept-ranges=${acceptRanges ?? "unknown"}`,
    );

    // Emit a start event so UI doesn't show 0/0.
    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: totalLength ? 0 : -1,
      total: totalLength,
      current: 0,
      ...(stepMeta ?? {}),
    });

    const progressStream = new stream.PassThrough();
    const progressIntervalMs = 200;
    let lastProgressAt = 0;
    const emitProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastProgressAt < progressIntervalMs) return;
      lastProgressAt = now;

      const percent =
        typeof totalLength === "number" && totalLength > 0
          ? Math.round((downloadedLength / totalLength) * 100)
          : -1;

      win.webContents.send("install-progress", {
        phase: "pwr-download",
        percent,
        total: totalLength,
        current: downloadedLength,
        ...(stepMeta ?? {}),
      });
    };

    progressStream.on("data", (chunk) => {
      downloadedLength += chunk.length;
      emitProgress(false);
    });

    try {
      await pipeline(
        // @ts-ignore
        stream.Readable.fromWeb(response.body),
        progressStream,
        fs.createWriteStream(tempPWRPath),
      );
    } catch (e) {
      const { userMessage, meta } = formatErrorWithHints(e, {
        op: `Download PWR (${version.build_name})`,
        url: version.url,
        filePath: tempPWRPath,
      });
      logger.error("PWR download pipeline failed", meta, e);
      const wrapped = new Error(userMessage);
      (wrapped as any).cause = e;
      throw wrapped;
    }

    const elapsedMs = Date.now() - startedAt;
    const st = safeStat(tempPWRPath);
    logger.info(
      `PWR download completed: ${tempPWRPath} (written=${downloadedLength} bytes, onDisk=${st?.size ?? "?"} bytes, ms=${elapsedMs})`,
    );

    // Hash the file so we can compare across runs (detect silent corruption).
    try {
      const hash = await sha256File(tempPWRPath);
      logger.info(`PWR sha256: ${hash}`);
    } catch (e) {
      logger.warn(
        `Failed to compute PWR sha256: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Quick sanity check: if Content-Length exists and doesn't match file size, treat as corrupted/truncated.
    if (
      typeof totalLength === "number" &&
      Number.isFinite(totalLength) &&
      totalLength > 0 &&
      typeof st?.size === "number" &&
      st.size !== totalLength
    ) {
      logger.error(
        `PWR size mismatch: expected=${totalLength} bytes but got=${st.size} bytes at ${tempPWRPath}`,
      );
      throw new Error(
        `Downloaded PWR appears truncated/corrupted (size mismatch: expected ${totalLength}, got ${st.size}).`,
      );
    }

    // Sniff first bytes to detect HTML/error pages masquerading as .pwr.
    const headHex = readHexSnippet(tempPWRPath, 0, 32);
    if (headHex) logger.info(`PWR header bytes (hex): ${headHex}`);
    if (st?.size && st.size >= 32) {
      const tailHex = readHexSnippet(tempPWRPath, Math.max(0, st.size - 32), 32);
      if (tailHex) logger.info(`PWR tail bytes (hex): ${tailHex}`);
    }

    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: 100,
      total: totalLength,
      current: downloadedLength,
      ...(stepMeta ?? {}),
    });

    return tempPWRPath;
  } catch (error) {
    // user asked to cancel so we pretend this was always supported
    if (
      controller.signal.aborted ||
      (error && typeof error === "object" && (error as any).name === "AbortError")
    ) {
      try {
        if (fs.existsSync(tempPWRPath)) fs.unlinkSync(tempPWRPath);
      } catch {
        // ignore
      }
      throw new UserCancelledError();
    }

    const statusMatch =
      typeof (error as any)?.message === "string"
        ? (error as any).message.match(/^HTTP\s+(\d{3})\b/)
        : null;
    const status = statusMatch ? Number(statusMatch[1]) : undefined;

    const { userMessage, meta } = formatErrorWithHints(error, {
      op: `Download PWR (${version.build_name})`,
      url: version.url,
      filePath: tempPWRPath,
      status: Number.isFinite(status as any) ? status : undefined,
    });
    logger.error(`Failed to download PWR for version ${version.build_name}`, meta, error);
    const wrapped = new Error(userMessage);
    (wrapped as any).cause = error;
    throw wrapped;
  } finally {
    pwrDownloadsInFlight.delete(key);
  }
};

const applyPWR = async (
  pwrPath: string,
  butlerPath: string,
  installDir: string,
  win: BrowserWindow,
  stepMeta?: { stepIndex: number; stepTotal: number },
) => {
  const pwrStat = safeStat(pwrPath);
  logger.info(
    `Applying PWR patch from ${pwrPath} to ${installDir} (pwrSize=${pwrStat?.size ?? "?"} mtimeMs=${pwrStat?.mtimeMs ?? "?"})`,
  );
  logger.info(`Butler: ${butlerPath} (${getButlerVersionOnce(butlerPath)})`);

  try {
    const hash = await sha256File(pwrPath);
    logger.info(`PWR sha256 (pre-apply): ${hash}`);
  } catch (e) {
    logger.warn(
      `Failed to compute PWR sha256 (pre-apply): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // IMPORTANT: staging dir must be unique per attempt.
  // Butler/wharf uses resume state in the staging directory; reusing a stale staging dir
  // across different .pwr files can trigger panics during Resume().
  const stagingDir = path.join(installDir, `staging-temp-${Date.now()}`);
  if (!fs.existsSync(installDir)) {
    logger.info(`Creating install directory: ${installDir}`);
    fs.mkdirSync(installDir, { recursive: true });
  }
  if (!fs.existsSync(stagingDir)) {
    logger.info(`Creating staging directory: ${stagingDir}`);
    fs.mkdirSync(stagingDir, { recursive: true });
  }

  win.webContents.send("install-progress", {
    phase: "patching",
    percent: -1,
    ...(stepMeta ?? {}),
  });

  return new Promise<string>((resolve, reject) => {
    let stderrBuf = "";

    const stderrLogPath = path.join(stagingDir, `butler-apply-stderr-${Date.now()}.log`);
    const stdoutLogPath = path.join(stagingDir, `butler-apply-stdout-${Date.now()}.log`);
    let stderrLog: fs.WriteStream | null = null;
    let stdoutLog: fs.WriteStream | null = null;
    try {
      stderrLog = fs.createWriteStream(stderrLogPath, { flags: "a" });
      stdoutLog = fs.createWriteStream(stdoutLogPath, { flags: "a" });
    } catch {
      // ignore
      stderrLog = null;
      stdoutLog = null;
    }

    const butlerArgs = ["apply", "--json", "--staging-dir", stagingDir, pwrPath, installDir];
    logger.info(`Butler command: ${butlerPath} ${butlerArgs.map((a) => JSON.stringify(a)).join(" ")}`);

    const butlerProcess = spawn(
      butlerPath,
      butlerArgs,
      {
        windowsHide: true,
      },
    ).on("error", (error) => {
      logger.error(
        "Butler process failed to start or encountered a critical error:",
        error,
      );
      const { userMessage } = formatErrorWithHints(error, {
        op: "Run butler apply",
        filePath: butlerPath,
        dirPath: installDir,
      });
      reject(new Error(userMessage));
    });

    // Try to surface butler progress in the UI.
    // Butler emits JSON lines when using --json.
    if (butlerProcess.stdout) {
      const rl = readline.createInterface({
        input: butlerProcess.stdout,
        crlfDelay: Infinity,
      });
      rl.on("line", (line) => {
        try {
          stdoutLog?.write(line + "\n");
        } catch {
          // ignore
        }
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const obj = JSON.parse(trimmed);

          // Common shapes seen across butler commands.
          // We handle a few variants defensively.
          const type = typeof obj?.type === "string" ? obj.type : "";
          const isProgress =
            type.toLowerCase().includes("progress") ||
            typeof obj?.percentage === "number" ||
            typeof obj?.percent === "number";

          if (!isProgress) return;

          let percent: number | undefined;
          if (typeof obj.percentage === "number") percent = obj.percentage;
          else if (typeof obj.percent === "number") percent = obj.percent;
          else if (typeof obj.progress === "number") percent = obj.progress;

          if (typeof percent !== "number" || Number.isNaN(percent)) return;
          // Normalize 0..1 to 0..100
          if (percent > 0 && percent <= 1) percent = percent * 100;
          percent = Math.max(0, Math.min(100, percent));

          win.webContents.send("install-progress", {
            phase: "patching",
            percent: Math.round(percent),
            ...(stepMeta ?? {}),
          });
        } catch {
          // Not JSON, ignore
        }
      });
      butlerProcess.on("close", () => {
        rl.close();
      });
    }

    butlerProcess.stderr.on("data", (data) => {
      const chunk = data.toString();
      try {
        stderrLog?.write(chunk);
      } catch {
        // ignore
      }
      // Keep a bounded snippet for error reporting
      if (stderrBuf.length < 8192) stderrBuf += chunk;
      logger.error(`Butler stderr: ${chunk.trim()}`);
    });

    butlerProcess.on("close", (code) => {
      logger.info(`Butler process exited with code ${code}`);
      if (stderrLogPath) logger.info(`Butler stderr log: ${stderrLogPath}`);
      if (stdoutLogPath) logger.info(`Butler stdout log: ${stdoutLogPath}`);
      try {
        stderrLog?.end();
        stdoutLog?.end();
      } catch {
        // ignore
      }

      // Force a final UI update so it doesn't stay stuck on "Downloading...".
      win.webContents.send("install-progress", {
        phase: "patching",
        percent: 100,
        ...(stepMeta ?? {}),
      });

      if (typeof code === "number" && code !== 0) {
        const err = new Error(
          `Butler apply failed (exit code ${code}).` +
            (stderrBuf.trim() ? ` Stderr: ${stderrBuf.trim().slice(0, 800)}` : ""),
        );
        const { userMessage, meta } = formatErrorWithHints(err, {
          op: "Apply PWR patch",
          filePath: pwrPath,
          dirPath: installDir,
        });
        logger.error("Butler apply failed", meta, err);
        const wrapped = new Error(userMessage);
        (wrapped as any).cause = err;
        reject(wrapped);
        return;
      }

      // Best-effort cleanup: staging dirs can be large.
      try {
        if (fs.existsSync(stagingDir)) {
          fs.rmSync(stagingDir, { recursive: true, force: true });
        }
      } catch {
        // ignore
      }

      resolve(installDir);
    });
  });
};

const retireExistingLatestReleaseIfNeeded = (gameDir: string, version: GameVersion) => {
  // Only the latest RELEASE uses the `game/latest` alias.
  if (version.type !== "release" || !version.isLatest) return;

  // If installing the latest release, and an older latest exists, move it into release/build-N.
  const latestDir = getLatestDir(gameDir);
  if (!fs.existsSync(latestDir)) return;

  const existing = readInstallManifest(latestDir);
  if (!existing || existing.build_index === version.build_index) return;

  logger.info(
    `Retiring existing 'latest' build ${existing.build_index} to release builds.`,
  );
  const targetBuildDir = getReleaseBuildDir(gameDir, existing.build_index);
  if (fs.existsSync(targetBuildDir)) {
    logger.info(
      `Target build directory ${targetBuildDir} already exists, deleting legacy 'latest'.`,
    );
    // Already installed elsewhere; remove latest to free the alias.
    fs.rmSync(latestDir, { recursive: true, force: true });
    return;
  }

  logger.info(`Moving 'latest' to ${targetBuildDir}`);
  fs.mkdirSync(path.dirname(targetBuildDir), { recursive: true });
  try {
    fs.renameSync(latestDir, targetBuildDir);
  } catch {
    // Fallback to copy for cross-device/locked cases.
    try {
      fs.cpSync(latestDir, targetBuildDir, { recursive: true });
      fs.rmSync(latestDir, { recursive: true, force: true });
    } catch {
      // ignore best-effort
    }
  }
};

const seedInstallDirFromExisting = async (
  fromDir: string,
  toDir: string,
  win: BrowserWindow,
) => {
  win.webContents.send("install-progress", {
    phase: "smart-copy",
    percent: -1,
  });

  if (fromDir === toDir) {
    throw new Error("Smart install source and target directories are the same.");
  }

  // If the destination exists (partial/failed install), clear it.
  try {
    if (fs.existsSync(toDir)) fs.rmSync(toDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  fs.mkdirSync(path.dirname(toDir), { recursive: true });

  const shouldSkipSeedPath = (srcPath: string) => {
    try {
      const rel = path.relative(fromDir, srcPath);
      if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;

      const parts = rel.split(path.sep).filter(Boolean);
      for (const p of parts) {
        if (p.startsWith("staging-temp-")) return true;
      }

      const base = path.basename(srcPath);
      if (base === INSTALLED_MANIFEST_FILENAME) return true;
      return false;
    } catch {
      return false;
    }
  };

  try {
    // Prefer async copy to avoid long sync stalls.
    // Node 18+ supports fs.promises.cp.
    // @ts-ignore
    await fs.promises.cp(fromDir, toDir, {
      recursive: true,
      // Avoid copying patching metadata which can confuse butler resume logic or keep stale state.
      filter: (src: string) => !shouldSkipSeedPath(src),
    });
  } catch (e) {
    const { userMessage, meta } = formatErrorWithHints(e, {
      op: "Smart seed copy",
      dirPath: toDir,
      fromDir,
    } as any);
    logger.error("Smart seed copy failed", meta, e);
    throw new Error(userMessage);
  }

  win.webContents.send("install-progress", {
    phase: "smart-copy",
    percent: 100,
  });
};

const getAppBundlePathIfInBundle = (targetPath: string): string | null => {
  if (process.platform !== "darwin") return null;
  try {
    let cur = path.dirname(targetPath);
    const root = path.parse(cur).root;
    while (cur && cur !== root) {
      if (cur.toLowerCase().endsWith(".app")) return cur;
      cur = path.dirname(cur);
    }
  } catch {
    // ignore
  }
  return null;
};

const getOnlinePatchBaseDirForTargetPath = (targetPath: string): string => {
  const exeName = path.basename(targetPath);
  const appBundle = getAppBundlePathIfInBundle(targetPath);
  if (process.platform === "darwin" && appBundle) {
    // Mirrors onlinePatch.ts: store patch state next to the .app bundle.
    return path.join(path.dirname(appBundle), ONLINE_PATCH_ROOT_DIRNAME, exeName);
  }
  return path.join(path.dirname(targetPath), ONLINE_PATCH_ROOT_DIRNAME);
};

const findOnlinePatchOriginalBackupPath = (targetPath: string): string | null => {
  const exeName = path.basename(targetPath);
  const base = getOnlinePatchBaseDirForTargetPath(targetPath);

  const direct = path.join(base, "original", exeName);
  if (fs.existsSync(direct)) return direct;

  // macOS bundle mode stores under: .butter-online-patch/<exeName>/original/<exeName>
  const nested = path.join(path.dirname(base), exeName, "original", exeName);
  if (fs.existsSync(nested)) return nested;

  return null;
};

const removeOnlinePatchArtifactsForTargetPath = (targetPath: string) => {
  const base = getOnlinePatchBaseDirForTargetPath(targetPath);

  // In bundle-mode the base is .../.butter-online-patch/<exeName>; remove the whole folder.
  const baseToRemove =
    process.platform === "darwin" ? path.dirname(base) : base;

  try {
    if (fs.existsSync(baseToRemove)) {
      fs.rmSync(baseToRemove, { recursive: true, force: true });
    }
  } catch {
    // ignore
  }
};

const sanitizeSeededInstallDirForSmartPatch = (installDir: string) => {
  // Remove our own manifest (not part of the pristine game tree).
  try {
    const manifestPath = path.join(installDir, INSTALLED_MANIFEST_FILENAME);
    if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
  } catch {
    // ignore
  }

  // Remove any stale butler staging directories left over from interrupted runs.
  try {
    const entries = fs.readdirSync(installDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!e.name.startsWith("staging-temp-")) continue;
      try {
        fs.rmSync(path.join(installDir, e.name), { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // If the source build had online patch enabled, Smart Install would copy:
  // - patched client/server binaries
  // - `.butter-online-patch` storage
  // Differential PWR patches are typically generated against a pristine tree,
  // so we restore originals (when available) and drop online-patch artifacts.

  try {
    const clientPath = resolveClientPath(installDir);
    if (clientPath && fs.existsSync(clientPath)) {
      const original = findOnlinePatchOriginalBackupPath(clientPath);
      if (original && fs.existsSync(original)) {
        fs.copyFileSync(original, clientPath);
      }
      removeOnlinePatchArtifactsForTargetPath(clientPath);
    }
  } catch {
    // ignore best-effort
  }

  try {
    const serverPath = resolveServerPath(installDir);
    if (serverPath && fs.existsSync(serverPath)) {
      const original = findOnlinePatchOriginalBackupPath(serverPath);
      if (original && fs.existsSync(original)) {
        fs.copyFileSync(original, serverPath);
      }
      removeOnlinePatchArtifactsForTargetPath(serverPath);
    }
  } catch {
    // ignore best-effort
  }

  // Best-effort: remove any top-level online-patch dir if present (rare).
  try {
    const legacy = path.join(installDir, ONLINE_PATCH_ROOT_DIRNAME);
    if (fs.existsSync(legacy)) fs.rmSync(legacy, { recursive: true, force: true });
  } catch {
    // ignore
  }
};

const findEntryCaseInsensitive = (
  dir: string,
  candidates: string[],
  kind: "file" | "dir",
): string | null => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const map = new Map<string, fs.Dirent>();
    for (const e of entries) map.set(e.name.toLowerCase(), e);

    for (const c of candidates) {
      const key = c.toLowerCase();
      const ent = map.get(key);
      if (!ent) continue;
      if (kind === "dir" && ent.isDirectory()) return ent.name;
      if (kind === "file" && ent.isFile()) return ent.name;
    }
  } catch {
    // ignore
  }
  return null;
};

const renameIfExists = (fromPath: string, toPath: string) => {
  try {
    if (!fs.existsSync(fromPath)) return;
    if (fs.existsSync(toPath)) return;
    fs.renameSync(fromPath, toPath);
  } catch {
    // ignore
  }
};

export const installBuild1FromFolder = async (
  gameDir: string,
  sourceDir: string,
  win: BrowserWindow,
  versionType: VersionType = "release",
) => {
  logger.info(
    `Starting manual Build-1 import (${versionType}) from ${sourceDir} into ${gameDir}`,
  );

  class InvalidBuild1FolderError extends Error {
    missing: string[];
    constructor(missing: string[]) {
      super("Invalid Build-1 folder structure");
      this.name = "InvalidBuild1FolderError";
      this.missing = missing;
    }
  }

  let installDir: string | null = null;

  try {
    migrateLegacyChannelInstallIfNeeded(gameDir, versionType);

    const src = typeof sourceDir === "string" ? sourceDir.trim() : "";
    if (!src) throw new Error("Invalid source directory.");
    const s = fs.statSync(src);
    if (!s.isDirectory()) throw new Error("Source path is not a directory.");

    const clientDirName = findEntryCaseInsensitive(src, ["Client", "client"], "dir");
    const serverDirName = findEntryCaseInsensitive(
      src,
      ["Server", "server", "Servers", "servers"],
      "dir",
    );
    const assetsName = findEntryCaseInsensitive(src, ["assets.zip"], "file");

    if (!clientDirName || !serverDirName || !assetsName) {
      const missing: string[] = [];
      if (!clientDirName) missing.push("Client");
      if (!serverDirName) missing.push("Server");
      if (!assetsName) missing.push("assets.zip");
      throw new InvalidBuild1FolderError(missing);
    }

    const version: GameVersion = {
      url: "",
      type: versionType,
      build_index: 1,
      build_name: "Build-1",
      isLatest: false,
    };

    installDir = resolveInstallDir(gameDir, version);

    fs.mkdirSync(gameDir, { recursive: true });
    win.webContents.send("install-started");

    // If the destination exists (partial/failed manual import), clear it.
    try {
      if (installDir && fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }

    fs.mkdirSync(path.dirname(installDir), { recursive: true });

    // Copy everything (Build-1 often includes extra files beyond the three we validate).
    // Then normalize the expected folder names.
    // @ts-ignore
    // @ts-ignore
    await fs.promises.cp(src, installDir!, { recursive: true });

    // Normalize Client + Server directory names to what the launcher expects.
    renameIfExists(path.join(installDir!, "client"), path.join(installDir!, "Client"));
    renameIfExists(path.join(installDir!, "clients"), path.join(installDir!, "Client"));

    // User said "servers"; our code expects "Server".
    renameIfExists(path.join(installDir!, "Servers"), path.join(installDir!, "Server"));
    renameIfExists(path.join(installDir!, "servers"), path.join(installDir!, "Server"));
    renameIfExists(path.join(installDir!, "server"), path.join(installDir!, "Server"));

    // Ensure assets.zip is present at the root (case-insensitive rename best-effort).
    try {
      const assetsExisting = findEntryCaseInsensitive(installDir!, ["assets.zip"], "file");
      if (assetsExisting && assetsExisting !== "assets.zip") {
        renameIfExists(
          path.join(installDir!, assetsExisting),
          path.join(installDir!, "assets.zip"),
        );
      }
    } catch {
      // ignore
    }

    // Final verification on the copied tree.
    const missingAfterCopy: string[] = [];
    if (!fs.existsSync(path.join(installDir!, "Client"))) missingAfterCopy.push("Client");
    if (!fs.existsSync(path.join(installDir!, "Server"))) missingAfterCopy.push("Server");
    if (!fs.existsSync(path.join(installDir!, "assets.zip"))) missingAfterCopy.push("assets.zip");
    if (missingAfterCopy.length) {
      throw new InvalidBuild1FolderError(missingAfterCopy);
    }

    // Record manifest so the launcher can detect it as installed.
    writeInstallManifest(installDir!, version);
    ensureClientExecutable(installDir!);

    win.webContents.send("install-finished", version);
    return true;
  } catch (error) {
    // Remove partial import files immediately.
    if (installDir) safeRmDir(installDir);

    const code = mapErrorToCode(error, { area: "install" });
    logger.error("Manual Build-1 import failed", { code }, error);
    const payload: any = { code };
    if (error instanceof InvalidBuild1FolderError) {
      payload.i18nKey = "launcher.version.invalidBuild1Folder";
      payload.i18nVars = { missing: (error.missing || []).join(", ") };
    }
    win.webContents.send("install-error", payload);
    return false;
  }
};

export const installGame = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  return await installGameFromPatchPlan(gameDir, version, win, {
    label: "INSTALL",
    patchPlan: { kind: "premium" },
  });
};

export const installGameNoPremiumFull = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  return await installGameFromPatchPlan(gameDir, version, win, {
    label: "INSTALL-NP-FULL",
    patchPlan: { kind: "nopremium" },
  });
};

export const installGameSmart = async (
  gameDir: string,
  version: GameVersion,
  fromBuildIndex: number,
  win: BrowserWindow,
) => {
  if (version.type !== "release") {
    throw new Error("Smart install is only supported for release builds.");
  }
  if (!Number.isFinite(fromBuildIndex) || fromBuildIndex <= 0) {
    throw new Error("Invalid smart install source build index.");
  }
  if (fromBuildIndex >= version.build_index) {
    throw new Error("Smart install source must be older than target build.");
  }

  return await installGameFromPatchPlan(gameDir, version, win, {
    baseOverride: fromBuildIndex,
    label: "SMART",
    patchPlan: { kind: "premium" },
  });
};
