import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import stream from "node:stream";
import { promisify } from "util";
import { BrowserWindow } from "electron";
import { spawnSync } from "node:child_process";

// Online patcher: if it works, it was an accident (and we should not mention it).
import {
  migrateLegacyChannelInstallIfNeeded,
  resolveClientPath,
  resolveExistingInstallDir,
  resolveServerPath,
} from "./paths";

const pipeline = promisify(stream.pipeline);

const FETCH_TIMEOUT_MS = 45_000;

type AggregateProgress = {
  total?: number;
  current: number;
};

const PATCH_ROOT_DIRNAME = ".butter-online-patch";
const PATCH_STATE_FILENAME = "state.json";

const normalizeHash = (h: string) => h.trim().toUpperCase();

const withCacheBuster = (url: string, cacheKey: string) => {
  try {
    const u = new URL(url);
    u.searchParams.set("cb", cacheKey);
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}cb=${encodeURIComponent(cacheKey)}`;
  }
};

const headContentLength = async (url: string): Promise<number | undefined> => {
  // because servers always send content length right
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const contentLength = res.headers.get("content-length");
    if (!contentLength) return undefined;
    const n = parseInt(contentLength, 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
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

const postMacBundleFixups = (targetPath: string) => {
  if (process.platform !== "darwin") return;

  const bundle = getAppBundlePathIfInBundle(targetPath);
  if (!bundle) return;

  // Best-effort: clear quarantine recursively so Gatekeeper doesn't block after we swap binaries.
  try {
    const r = spawnSync("xattr", ["-dr", "com.apple.quarantine", bundle], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (r.status !== 0) {
      const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
      if (out) console.warn("xattr quarantine removal output:", out);
    }
  } catch {
    // ignore
  }

  // Best-effort: ad-hoc sign the bundle to avoid "is damaged" / signature invalid errors.
  try {
    const sign = spawnSync(
      "codesign",
      ["--force", "--deep", "--sign", "-", bundle],
      { windowsHide: true, encoding: "utf8" },
    );
    if (sign.status !== 0) {
      const out = `${sign.stdout || ""}${sign.stderr || ""}`.trim();
      if (out) console.warn("codesign output:", out);
    }
  } catch {
    // ignore
  }
};

const getClientPath = (gameDir: string, version: GameVersion) => {
  migrateLegacyChannelInstallIfNeeded(gameDir, version.type);
  const installDir = resolveExistingInstallDir(gameDir, version);
  return resolveClientPath(installDir);
};

const getPatchPaths = (clientPath: string) => {
  const clientDir = path.dirname(clientPath);
  const exeName = path.basename(clientPath);

  // macOS: never write patch state inside the .app bundle (Gatekeeper/signing/EPERM issues).
  // Instead, keep patch storage next to the app bundle, namespaced by executable name.
  const appBundle = getAppBundlePathIfInBundle(clientPath);
  const root = appBundle
    ? path.join(path.dirname(appBundle), PATCH_ROOT_DIRNAME, exeName)
    : path.join(clientDir, PATCH_ROOT_DIRNAME);
  const originalDir = path.join(root, "original");
  const patchedDir = path.join(root, "patched");

  const originalPath = path.join(originalDir, exeName);
  const patchedPath = path.join(patchedDir, exeName);
  const statePath = path.join(root, PATCH_STATE_FILENAME);
  const tempDownloadPath = path.join(
    root,
    `temp_patch_download_${Date.now()}_${exeName}`,
  );

  return {
    root,
    originalDir,
    patchedDir,
    originalPath,
    patchedPath,
    statePath,
    tempDownloadPath,
  };
};

const ensureDirs = (dirs: string[]) => {
  for (const d of dirs) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
};

const moveReplace = (from: string, to: string) => {
  ensureDirs([path.dirname(to)]);

  try {
    if (fs.existsSync(to)) fs.unlinkSync(to);
  } catch {
    // ignore
  }

  try {
    fs.renameSync(from, to);
    return;
  } catch {
    // Fallback to copy+remove (cross-device / locked edge cases)
    fs.copyFileSync(from, to);
    try {
      fs.unlinkSync(from);
    } catch {
      // ignore
    }
  }
};

const unlinkIfExists = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
};

const removeDirIfExists = (dirPath: string) => {
  try {
    if (!fs.existsSync(dirPath)) return;
    // Node 14+ (Electron 30+) supports rmSync.
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Best-effort fallback for older runtimes / edge cases.
    try {
      // @ts-ignore - best-effort fallback for runtimes where rmSync is unreliable.
      fs.rmdirSync(dirPath, { recursive: true });
    } catch {
      // ignore
    }
  }
};

const copyReplace = (from: string, to: string) => {
  ensureDirs([path.dirname(to)]);
  unlinkIfExists(to);
  fs.copyFileSync(from, to);
};

type PatchStateFile = {
  enabled: boolean;
  patch_hash?: string;
  patch_url?: string;
  original_url?: string;
  patch_note?: string;
  updatedAt: number;
};

const readPatchState = (statePath: string): PatchStateFile | null => {
  try {
    if (!fs.existsSync(statePath)) return null;
    const raw = fs.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.enabled !== "boolean") return null;
    return parsed as PatchStateFile;
  } catch {
    return null;
  }
};

const writePatchState = (statePath: string, next: PatchStateFile) => {
  try {
    ensureDirs([path.dirname(statePath)]);
    fs.writeFileSync(statePath, JSON.stringify(next, null, 2), "utf8");
  } catch {
    // ignore
  }
};

const downloadFileWithProgress = async (
  url: string,
  outPath: string,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress"
    | "online-unpatch-progress",
  phase: "online-patch" | "online-unpatch" = "online-patch",
  aggregate?: AggregateProgress,
) => {
  // one progress bar to rule them all
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(url, { signal: controller.signal }).finally(
    () => {
      clearTimeout(timeout);
    },
  );

  if (!response.ok)
    throw new Error(`Failed to download file (${response.status})`);
  if (!response.body) throw new Error("No response body");

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType.includes("text/html") ||
    contentType.includes("application/xhtml+xml")
  ) {
    let snippet = "";
    try {
      snippet = (await response.clone().text()).slice(0, 200);
    } catch {
      // ignore
    }

    throw new Error(
      `Download returned HTML instead of a binary. This usually means a CDN cache or error page was served. URL: ${url}` +
        (snippet ? ` (starts with: ${JSON.stringify(snippet)})` : ""),
    );
  }

  const contentLength = response.headers.get("content-length");
  const fileTotalLength = contentLength ? parseInt(contentLength, 10) : 0;
  const totalLength =
    typeof aggregate?.total === "number" && aggregate.total > 0
      ? aggregate.total
      : fileTotalLength;
  let downloadedLength = 0;

  const progressStream = new stream.PassThrough();
  const progressIntervalMs = 200;
  let lastProgressAt = 0;
  const emitProgress = (force = false) => {
    const now = Date.now();
    if (!force && now - lastProgressAt < progressIntervalMs) return;
    lastProgressAt = now;

    const percent =
      totalLength > 0
        ? Math.round(
            ((aggregate ? aggregate.current : downloadedLength) / totalLength) *
              100,
          )
        : -1;

    win.webContents.send(progressChannel, {
      phase,
      percent,
      total: totalLength > 0 ? totalLength : undefined,
      current: aggregate ? aggregate.current : downloadedLength,
    });
  };

  progressStream.on("data", (chunk) => {
    downloadedLength += chunk.length;

    if (aggregate) aggregate.current += chunk.length;

    emitProgress(false);
  });

  // Initial state (indeterminate if content-length missing)
  win.webContents.send(progressChannel, {
    phase,
    percent: totalLength > 0 ? 0 : -1,
    total: totalLength > 0 ? totalLength : undefined,
    current: aggregate ? aggregate.current : 0,
  });

  await pipeline(
    // @ts-expect-error - Node stream/web stream type mismatch
    stream.Readable.fromWeb(response.body),
    progressStream,
    fs.createWriteStream(outPath),
  );

  const finalPercent =
    totalLength > 0
      ? Math.round(
          ((aggregate ? aggregate.current : downloadedLength) / totalLength) *
            100,
        )
      : -1;
  win.webContents.send(progressChannel, {
    phase,
    percent: aggregate ? finalPercent : 100,
    total: totalLength > 0 ? totalLength : undefined,
    current: aggregate ? aggregate.current : downloadedLength,
  });
};

// Client Patching

export const getClientPatchState = (
  gameDir: string,
  version: GameVersion,
): {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  downloaded: boolean;
} => {
  const supported =
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin";
  const available = !!(version.patch_url && version.patch_hash);
  if (!supported || !available)
    return { supported, available, enabled: false, downloaded: false };

  const clientPath = getClientPath(gameDir, version);
  if (!fs.existsSync(clientPath))
    return { supported, available, enabled: false, downloaded: false };

  const { statePath, patchedPath, originalPath } = getPatchPaths(clientPath);
  const state = readPatchState(statePath);

  // Derive current on-disk state (can drift if state.json is deleted/corrupted).
  let clientIsPatched = false;
  try {
    const currentHash = crypto.createHash("sha256");
    const input = fs.createReadStream(clientPath);
    input.on("data", (chunk) => currentHash.update(chunk));
    // Synchronous wrapper: getOnlinePatchState is sync, so keep it cheap if hash can't be computed.
    // If needed, health-check uses the async sha256File path.
    input.on("error", () => undefined);
    // Not awaiting; treat as unknown.
    clientIsPatched = false;
  } catch {
    clientIsPatched = false;
  }

  // If state says "unpatched" but the client is clearly patched and we have patch storage,
  // treat it as patched (and heal state) to avoid false "Fix Client" and broken disable.
  let enabled = !!state?.enabled;
  if (!enabled && clientIsPatched && fs.existsSync(patchedPath)) {
    enabled = true;
    writePatchState(statePath, {
      enabled: true,
      patch_hash: version.patch_hash,
      patch_url: version.patch_url,
      original_url: version.original_url ?? state?.original_url,
      patch_note: version.patch_note,
      updatedAt: Date.now(),
    });
  }

  // If state is missing, infer from disk.
  if (!state && clientIsPatched) enabled = true;

  // If we're enabled but missing backups, don't block state (disable can recover via original_url).
  void originalPath;

  return {
    supported,
    available,
    enabled,
    downloaded: fs.existsSync(patchedPath),
  };
};

export const getClientPatchHealth = async (
  gameDir: string,
  version: GameVersion,
): Promise<{
  supported: boolean;
  available: boolean;
  enabled: boolean;
  clientIsPatched: boolean;
  needsFixClient: boolean;
  patchOutdated: boolean;
}> => {
  const supported =
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin";
  const available = !!(version.patch_url && version.patch_hash);
  if (!supported || !available) {
    return {
      supported,
      available,
      enabled: false,
      clientIsPatched: false,
      needsFixClient: false,
      patchOutdated: false,
    };
  }

  const clientPath = getClientPath(gameDir, version);
  if (!fs.existsSync(clientPath)) {
    return {
      supported,
      available,
      enabled: false,
      clientIsPatched: false,
      needsFixClient: false,
      patchOutdated: false,
    };
  }

  const { statePath, patchedPath } = getPatchPaths(clientPath);
  const state = readPatchState(statePath);

  // Start with remembered state when present.
  let enabled = typeof state?.enabled === "boolean" ? state.enabled : false;

  const detectHash = state?.patch_hash || version.patch_hash;
  let clientIsPatched = false;
  try {
    const currentHash = await sha256File(clientPath);
    clientIsPatched =
      !!detectHash && normalizeHash(currentHash) === normalizeHash(detectHash);
  } catch {
    clientIsPatched = false;
  }

  // Heal drift: state says unpatched but binary is patched and we have patch storage.
  if (!enabled && clientIsPatched && fs.existsSync(patchedPath)) {
    enabled = true;
    writePatchState(statePath, {
      enabled: true,
      patch_hash: detectHash ?? version.patch_hash,
      patch_url: version.patch_url,
      original_url: version.original_url ?? state?.original_url,
      patch_note: version.patch_note,
      updatedAt: Date.now(),
    });
  }

  // If state is missing, infer from disk (avoid false Fix Client on restart).
  if (!state && clientIsPatched) enabled = true;

  // Show Fix Client only when the launcher explicitly remembers "unpatched" but the file is patched.
  const needsFixClient = state?.enabled === false && clientIsPatched;

  const patchOutdated =
    !!enabled &&
    !!state?.patch_hash &&
    !!version.patch_hash &&
    normalizeHash(state.patch_hash) !== normalizeHash(version.patch_hash);

  return {
    supported,
    available,
    enabled,
    clientIsPatched,
    needsFixClient,
    patchOutdated,
  };
};

export const fixClientToUnpatched = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"fixed" | "not-needed" | "skipped"> => {
  const expectedPatchHash = version.patch_hash;
  if (!expectedPatchHash) return "skipped";

  const clientPath = getClientPath(gameDir, version);
  if (!fs.existsSync(clientPath)) return "skipped";

  // Only run when current client is actually the patched binary.
  try {
    const currentHash = await sha256File(clientPath);
    const isPatchedNow =
      normalizeHash(currentHash) === normalizeHash(expectedPatchHash);
    if (!isPatchedNow) return "not-needed";
  } catch {
    return "skipped";
  }

  const originalUrl = version.original_url;
  if (!originalUrl) {
    throw new Error("Missing original_url for this build. Cannot fix client.");
  }

  const paths = getPatchPaths(clientPath);
  ensureDirs([paths.root, paths.originalDir, paths.patchedDir]);

  // Download original exe into a temp file.
  const tempOriginal = path.join(
    paths.root,
    `temp_original_${Date.now()}_${path.basename(clientPath)}`,
  );
  await downloadFileWithProgress(
    withCacheBuster(originalUrl, `orig-${Date.now()}`),
    tempOriginal,
    win,
    progressChannel,
    "online-unpatch",
  );

  // Safety: don't accept a server mistake that returns the patched file.
  const downloadedHash = await sha256File(tempOriginal);
  if (normalizeHash(downloadedHash) === normalizeHash(expectedPatchHash)) {
    unlinkIfExists(tempOriginal);
    throw new Error(
      "Original download matches patch hash; refusing to fix client.",
    );
  }

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: -1,
  });

  // Swap (safe):
  // - Move current client (patched) to temp
  // - Persist it to patched storage (if missing)
  // - Replace active client with downloaded original
  const tempCurrent = path.join(
    paths.root,
    `temp_current_${Date.now()}_${path.basename(clientPath)}`,
  );
  moveReplace(clientPath, tempCurrent);

  // Keep a patched copy for later enabling patch.
  if (!fs.existsSync(paths.patchedPath)) {
    copyReplace(tempCurrent, paths.patchedPath);
  }

  // Preserve an original backup and also activate it.
  if (!fs.existsSync(paths.originalPath)) {
    copyReplace(tempOriginal, paths.originalPath);
  }

  moveReplace(tempOriginal, clientPath);
  unlinkIfExists(tempCurrent);

  // macOS: ensure the bundle is runnable after swapping binaries.
  postMacBundleFixups(clientPath);

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: 100,
  });

  writePatchState(paths.statePath, {
    enabled: false,
    patch_hash: expectedPatchHash,
    patch_url: version.patch_url,
    original_url: originalUrl,
    patch_note: version.patch_note,
    updatedAt: Date.now(),
  });

  return "fixed";
};

export const enableClientPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress" = "online-patch-progress",
  aggregate?: AggregateProgress,
): Promise<"enabled" | "already-enabled" | "skipped"> => {
  const url = version.patch_url;
  const expectedHash = version.patch_hash;
  if (!url || !expectedHash) return "skipped";

  const clientPath = getClientPath(gameDir, version);
  if (!fs.existsSync(clientPath)) return "skipped";

  const paths = getPatchPaths(clientPath);
  ensureDirs([paths.root, paths.originalDir, paths.patchedDir]);

  const existing = readPatchState(paths.statePath);

  // If already enabled, only consider it "already" when the active client matches the expected hash.
  if (existing?.enabled) {
    try {
      const currentHash = await sha256File(clientPath);
      if (normalizeHash(currentHash) === normalizeHash(expectedHash))
        return "already-enabled";
    } catch {
      // ignore
    }
    // Otherwise, proceed to (re)apply the expected patched binary.
  }

  // Ensure patched exe is downloaded into storage.
  let patchedOk = false;
  if (fs.existsSync(paths.patchedPath)) {
    // Fast path: if the expected hash changed, treat cached patched exe as stale.
    if (
      existing?.patch_hash &&
      normalizeHash(existing.patch_hash) !== normalizeHash(expectedHash)
    ) {
      patchedOk = false;
    } else {
      try {
        const cachedHash = await sha256File(paths.patchedPath);
        patchedOk = normalizeHash(cachedHash) === normalizeHash(expectedHash);
      } catch {
        patchedOk = false;
      }
    }
  }

  if (!patchedOk) {
    try {
      if (fs.existsSync(paths.patchedPath)) fs.unlinkSync(paths.patchedPath);
    } catch {
      // ignore
    }

    await downloadFileWithProgress(
      withCacheBuster(url, `patch-${normalizeHash(expectedHash)}`),
      paths.tempDownloadPath,
      win,
      progressChannel,
      "online-patch",
      aggregate,
    );

    const downloadedHash = await sha256File(paths.tempDownloadPath);
    const got = normalizeHash(downloadedHash);
    const expected = normalizeHash(expectedHash);
    if (got !== expected) {
      try {
        fs.unlinkSync(paths.tempDownloadPath);
      } catch {
        // ignore
      }
      throw new Error(
        `Patch hash mismatch (SHA256). Expected ${expected}, got ${got}.`,
      );
    }

    moveReplace(paths.tempDownloadPath, paths.patchedPath);
  }

  // Swap (safe):
  // - Never overwrite a preserved original backup.
  // - Keep the downloaded patched exe on disk.
  // - Replace the active client by moving it to a temp file, then copying patched into place.
  win.webContents.send(progressChannel, { phase: "online-patch", percent: -1 });

  // If we don't have an original backup yet, preserve the current client as original.
  if (!fs.existsSync(paths.originalPath)) {
    // Safety: if the current client is already patched, do NOT store it as original.
    // This can happen if state drifted or a previous swap failed.
    let currentIsPatched = false;
    try {
      const currentHash = await sha256File(clientPath);
      currentIsPatched =
        normalizeHash(currentHash) === normalizeHash(expectedHash);
    } catch {
      currentIsPatched = false;
    }

    if (currentIsPatched) {
      const originalUrl = version.original_url || existing?.original_url;
      if (!originalUrl) {
        throw new Error(
          "Cannot preserve original: client is already patched and original_url is missing.",
        );
      }

      const tempOriginal = path.join(
        paths.root,
        `temp_original_${Date.now()}_${path.basename(clientPath)}`,
      );
      await downloadFileWithProgress(
        withCacheBuster(originalUrl, `orig-${Date.now()}`),
        tempOriginal,
        win,
        progressChannel,
        "online-patch",
        aggregate,
      );

      const downloadedHash = await sha256File(tempOriginal);
      if (normalizeHash(downloadedHash) === normalizeHash(expectedHash)) {
        unlinkIfExists(tempOriginal);
        throw new Error(
          "Original download matches patch hash; refusing to preserve.",
        );
      }

      moveReplace(tempOriginal, paths.originalPath);
    } else {
      moveReplace(clientPath, paths.originalPath);
    }
  } else {
    // Original already preserved; move current client out of the way.
    const tempCurrent = path.join(
      paths.root,
      `temp_current_${Date.now()}_${path.basename(clientPath)}`,
    );
    moveReplace(clientPath, tempCurrent);
    unlinkIfExists(tempCurrent);
  }

  copyReplace(paths.patchedPath, clientPath);
  // macOS: ensure the bundle is runnable after swapping binaries.
  postMacBundleFixups(clientPath);
  win.webContents.send(progressChannel, {
    phase: "online-patch",
    percent: 100,
  });

  writePatchState(paths.statePath, {
    enabled: true,
    patch_hash: expectedHash,
    patch_url: url,
    original_url: version.original_url,
    patch_note: version.patch_note,
    updatedAt: Date.now(),
  });

  return "enabled";
};

export const disableClientPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"disabled" | "already-disabled" | "skipped"> => {
  const url = version.patch_url;
  const expectedHash = version.patch_hash;
  if (!url || !expectedHash) return "skipped";

  const clientPath = getClientPath(gameDir, version);
  if (!fs.existsSync(clientPath)) return "skipped";

  const paths = getPatchPaths(clientPath);
  ensureDirs([paths.root, paths.originalDir, paths.patchedDir]);

  const existing = readPatchState(paths.statePath);

  // Trust disk reality: allow disabling if the active client matches either the current expected hash
  // or the stored hash (when the server hash has changed since it was applied).
  let clientIsPatched = false;
  try {
    const currentHash = await sha256File(clientPath);
    const storedHash = existing?.patch_hash;
    clientIsPatched =
      normalizeHash(currentHash) === normalizeHash(expectedHash) ||
      (!!storedHash &&
        normalizeHash(currentHash) === normalizeHash(storedHash));
  } catch {
    clientIsPatched = false;
  }

  if (!existing?.enabled && !clientIsPatched) return "already-disabled";

  if (!fs.existsSync(paths.originalPath)) {
    const originalUrl = version.original_url || existing?.original_url;
    if (!originalUrl) {
      throw new Error(
        "Original client backup not found. Reinstall the game to restore it.",
      );
    }

    // Legacy recovery: download the original client exe into the backup slot.
    const tempOriginal = path.join(
      paths.root,
      `temp_original_${Date.now()}_${path.basename(clientPath)}`,
    );
    await downloadFileWithProgress(
      withCacheBuster(originalUrl, `orig-${Date.now()}`),
      tempOriginal,
      win,
      progressChannel,
      "online-unpatch",
    );

    // Safety: if server accidentally serves the patched exe, do not accept it as original.
    try {
      const downloadedHash = await sha256File(tempOriginal);
      if (normalizeHash(downloadedHash) === normalizeHash(expectedHash)) {
        unlinkIfExists(tempOriginal);
        throw new Error(
          "Original download matches patch hash; refusing to restore.",
        );
      }
    } catch (e) {
      if (e instanceof Error) throw e;
      // ignore hash failure
    }

    moveReplace(tempOriginal, paths.originalPath);
  }

  // If the preserved "original" is actually the patched exe, recover by re-downloading original_url.
  try {
    const originalHash = await sha256File(paths.originalPath);
    if (normalizeHash(originalHash) === normalizeHash(expectedHash)) {
      const originalUrl = version.original_url || existing?.original_url;
      if (!originalUrl) {
        throw new Error(
          "Original backup is invalid and original_url is missing.",
        );
      }

      const tempOriginal = path.join(
        paths.root,
        `temp_original_${Date.now()}_${path.basename(clientPath)}`,
      );
      await downloadFileWithProgress(
        withCacheBuster(originalUrl, `orig-${Date.now()}`),
        tempOriginal,
        win,
        progressChannel,
        "online-unpatch",
      );

      const downloadedHash = await sha256File(tempOriginal);
      if (normalizeHash(downloadedHash) === normalizeHash(expectedHash)) {
        unlinkIfExists(tempOriginal);
        throw new Error(
          "Original download matches patch hash; refusing to restore.",
        );
      }

      moveReplace(tempOriginal, paths.originalPath);
    }
  } catch (e) {
    if (e instanceof Error) throw e;
    // ignore
  }

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: -1,
  });

  // Swap back (safe):
  // - Move current client (expected patched) into temp
  // - Copy temp into patched storage (so patch stays downloaded)
  // - Copy original backup into active client
  const tempCurrent = path.join(
    paths.root,
    `temp_current_${Date.now()}_${path.basename(clientPath)}`,
  );
  moveReplace(clientPath, tempCurrent);
  copyReplace(tempCurrent, paths.patchedPath);
  copyReplace(paths.originalPath, clientPath);
  unlinkIfExists(tempCurrent);

  // macOS: ensure the bundle is runnable after restoring the original.
  postMacBundleFixups(clientPath);

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: 100,
  });

  writePatchState(paths.statePath, {
    enabled: false,
    patch_hash: expectedHash,
    patch_url: url,
    original_url: version.original_url || existing?.original_url,
    patch_note: version.patch_note,
    updatedAt: Date.now(),
  });

  // Final sanity: if we still look patched, surface a clear error.
  try {
    const afterHash = await sha256File(clientPath);
    if (normalizeHash(afterHash) === normalizeHash(expectedHash)) {
      throw new Error(
        "Unpatch completed but client hash is still patched. Use Fix Client.",
      );
    }
  } catch (e) {
    if (e instanceof Error) throw e;
  }

  return "disabled";
};

export const checkClientPatchNeeded = async (
  gameDir: string,
  version: GameVersion,
): Promise<"needs" | "up-to-date" | "skipped"> => {
  const expectedHash = version.patch_hash;
  if (!version.patch_url || !expectedHash) return "skipped";

  const clientPath = getClientPath(gameDir, version);
  if (!fs.existsSync(clientPath)) return "skipped";

  try {
    const currentHash = await sha256File(clientPath).catch(() => null);
    if (!currentHash) return "needs";
    if (normalizeHash(currentHash) === normalizeHash(expectedHash))
      return "up-to-date";
    return "needs";
  } catch {
    return "needs";
  }
};

// Server Patching

const getServerPath = (gameDir: string, version: GameVersion) => {
  migrateLegacyChannelInstallIfNeeded(gameDir, version.type);
  const installDir = resolveExistingInstallDir(gameDir, version);
  return resolveServerPath(installDir);
};

export const getServerPatchState = (
  gameDir: string,
  version: GameVersion,
): {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  downloaded: boolean;
} => {
  const supported =
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin";
  const available = !!(version.server_url && version.unserver_url);
  if (!supported || !available)
    return { supported, available, enabled: false, downloaded: false };

  const serverPath = getServerPath(gameDir, version);
  if (!fs.existsSync(serverPath))
    return { supported, available, enabled: false, downloaded: false };

  const { statePath, patchedPath, originalPath } = getPatchPaths(serverPath);
  const state = readPatchState(statePath);

  let enabled = !!state?.enabled;
  if (!enabled && fs.existsSync(patchedPath)) {
    enabled = true;
    writePatchState(statePath, {
      enabled: true,
      patch_hash: version.patch_hash ?? state?.patch_hash,
      patch_url: version.server_url,
      original_url: version.unserver_url ?? state?.original_url,
      patch_note: state?.patch_note,
      updatedAt: Date.now(),
    });
  }

  void originalPath;

  return {
    supported,
    available,
    enabled,
    downloaded: fs.existsSync(patchedPath),
  };
};

export const getServerPatchHealth = async (
  gameDir: string,
  version: GameVersion,
): Promise<{
  supported: boolean;
  available: boolean;
  enabled: boolean;
  serverIsPatched: boolean;
  needsFixServer: boolean;
}> => {
  const supported =
    process.platform === "win32" ||
    process.platform === "linux" ||
    process.platform === "darwin";
  const available = !!(version.server_url && version.unserver_url);
  if (!supported || !available) {
    return {
      supported,
      available,
      enabled: false,
      serverIsPatched: false,
      needsFixServer: false,
    };
  }

  const serverPath = getServerPath(gameDir, version);
  if (!fs.existsSync(serverPath)) {
    return {
      supported,
      available,
      enabled: false,
      serverIsPatched: false,
      needsFixServer: false,
    };
  }

  const { statePath, patchedPath } = getPatchPaths(serverPath);
  const state = readPatchState(statePath);

  let enabled = typeof state?.enabled === "boolean" ? state.enabled : false;

  // For server, we don't have a hash to verify, so we trust the state file
  let serverIsPatched = enabled;
  if (!enabled && fs.existsSync(patchedPath)) {
    enabled = true;
    serverIsPatched = true;
    writePatchState(statePath, {
      enabled: true,
      patch_hash: version.patch_hash ?? state?.patch_hash,
      patch_url: version.server_url,
      original_url: version.unserver_url ?? state?.original_url,
      patch_note: state?.patch_note,
      updatedAt: Date.now(),
    });
  }

  const needsFixServer = state?.enabled === false && serverIsPatched;

  return {
    supported,
    available,
    enabled,
    serverIsPatched,
    needsFixServer,
  };
};

export const fixServerToUnpatched = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"fixed" | "not-needed" | "skipped"> => {
  // Logic mirrors fixClientToUnpatched but for Server
  const serverPath = getServerPath(gameDir, version);
  if (!fs.existsSync(serverPath)) return "skipped";

  // Check health to see if we actually need a fix
  const health = await getServerPatchHealth(gameDir, version);
  if (!health.needsFixServer) return "not-needed";

  const originalUrl = version.unserver_url;
  if (!originalUrl) {
    throw new Error(
      "Missing unserver_url (original) for this build. Cannot fix server.",
    );
  }

  const paths = getPatchPaths(serverPath);
  ensureDirs([paths.root, paths.originalDir, paths.patchedDir]);

  // Download original server into a temp file
  const tempOriginal = path.join(
    paths.root,
    `temp_original_fix_${Date.now()}_${path.basename(serverPath)}`,
  );

  await downloadFileWithProgress(
    withCacheBuster(originalUrl, `orig-fix-${Date.now()}`),
    tempOriginal,
    win,
    progressChannel,
    "online-unpatch",
  );

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: -1,
  });

  // Swap: Move current broken/patched server to temp, put downloaded original in place
  const tempCurrent = path.join(
    paths.root,
    `temp_current_broken_${Date.now()}_${path.basename(serverPath)}`,
  );

  moveReplace(serverPath, tempCurrent);

  // If we don't have a patched backup, we might want to save the 'broken' one just in case,
  // but usually 'fix' implies the current state is untrustworthy.
  // We will prioritize preserving a known good original.
  if (!fs.existsSync(paths.originalPath)) {
    copyReplace(tempOriginal, paths.originalPath);
  }

  moveReplace(tempOriginal, serverPath);
  unlinkIfExists(tempCurrent);

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: 100,
  });

  // Force state to disabled/healthy
  writePatchState(paths.statePath, {
    enabled: false,
    patch_url: version.server_url,
    original_url: originalUrl,
    updatedAt: Date.now(),
  });

  return "fixed";
};

export const enableServerPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress" = "online-patch-progress",
  aggregate?: AggregateProgress,
): Promise<"enabled" | "already-enabled" | "skipped"> => {
  // server patch now gets to be special too
  const url = version.server_url;
  const originalUrl = version.unserver_url;
  if (!url || !originalUrl) return "skipped";

  const serverPath = getServerPath(gameDir, version);
  if (!fs.existsSync(serverPath)) return "skipped";

  const paths = getPatchPaths(serverPath);
  ensureDirs([paths.root, paths.originalDir, paths.patchedDir]);

  const existing = readPatchState(paths.statePath);

  const expectedKey = version.patch_hash ? normalizeHash(version.patch_hash) : undefined;

  if (existing?.enabled) {
    // we trust state until we absolutely do not
    // Only treat it as already-enabled when the expected key matches (if present).
    if (!expectedKey) return "already-enabled";
    if (existing.patch_hash && normalizeHash(existing.patch_hash) === expectedKey)
      return "already-enabled";
    // Otherwise, proceed to re-apply and refresh cached patched server.
  }

  // Download patched server if not cached (or stale)
  let patchedOk = false;
  if (fs.existsSync(paths.patchedPath)) {
    if (!expectedKey) {
      patchedOk = true;
    } else if (!existing?.patch_hash) {
      patchedOk = false;
    } else {
      patchedOk = normalizeHash(existing.patch_hash) === expectedKey;
    }
  }

  if (!patchedOk) {
    // cache invalidation is my favorite hobby
    try {
      if (fs.existsSync(paths.patchedPath)) fs.unlinkSync(paths.patchedPath);
    } catch {
      // ignore
    }

    await downloadFileWithProgress(
      withCacheBuster(url, `server-patch-${expectedKey ?? Date.now().toString()}`),
      paths.tempDownloadPath,
      win,
      progressChannel,
      "online-patch",
      aggregate,
    );

    moveReplace(paths.tempDownloadPath, paths.patchedPath);
  }

  win.webContents.send(progressChannel, { phase: "online-patch", percent: -1 });

  // Preserve original if not already backed up
  if (!fs.existsSync(paths.originalPath)) {
    moveReplace(serverPath, paths.originalPath);
  } else {
    const tempCurrent = path.join(
      paths.root,
      `temp_current_${Date.now()}_${path.basename(serverPath)}`,
    );
    moveReplace(serverPath, tempCurrent);
    unlinkIfExists(tempCurrent);
  }

  copyReplace(paths.patchedPath, serverPath);
  win.webContents.send(progressChannel, {
    phase: "online-patch",
    percent: 100,
  });

  writePatchState(paths.statePath, {
    enabled: true,
    patch_hash: version.patch_hash,
    patch_url: url,
    original_url: originalUrl,
    updatedAt: Date.now(),
  });

  return "enabled";
};

export const disableServerPatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"disabled" | "already-disabled" | "skipped"> => {
  const url = version.server_url;
  const originalUrl = version.unserver_url;
  if (!url || !originalUrl) return "skipped";

  const serverPath = getServerPath(gameDir, version);
  if (!fs.existsSync(serverPath)) return "skipped";

  const paths = getPatchPaths(serverPath);
  ensureDirs([paths.root, paths.originalDir, paths.patchedDir]);

  const existing = readPatchState(paths.statePath);

  // Allow disable if state is missing but we have evidence of patch storage.
  const looksPatched = !!existing?.enabled || fs.existsSync(paths.patchedPath);
  if (!looksPatched) return "already-disabled";

  if (!fs.existsSync(paths.originalPath)) {
    // Need to download the original server
    const tempOriginal = path.join(
      paths.root,
      `temp_original_${Date.now()}_${path.basename(serverPath)}`,
    );
    await downloadFileWithProgress(
      withCacheBuster(originalUrl, `orig-${Date.now()}`),
      tempOriginal,
      win,
      progressChannel,
      "online-unpatch",
    );

    moveReplace(tempOriginal, paths.originalPath);
  }

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: -1,
  });

  // Swap back
  const tempCurrent = path.join(
    paths.root,
    `temp_current_${Date.now()}_${path.basename(serverPath)}`,
  );
  moveReplace(serverPath, tempCurrent);
  copyReplace(tempCurrent, paths.patchedPath);
  copyReplace(paths.originalPath, serverPath);
  unlinkIfExists(tempCurrent);

  win.webContents.send(progressChannel, {
    phase: "online-unpatch",
    percent: 100,
  });

  writePatchState(paths.statePath, {
    enabled: false,
    patch_hash: version.patch_hash,
    patch_url: url,
    original_url: originalUrl,
    updatedAt: Date.now(),
  });

  return "disabled";
};

export const checkServerPatchNeeded = async (
  gameDir: string,
  version: GameVersion,
): Promise<"needs" | "up-to-date" | "skipped"> => {
  if (!version.server_url || !version.unserver_url) return "skipped";

  const serverPath = getServerPath(gameDir, version);
  if (!fs.existsSync(serverPath)) return "skipped";

  const { statePath } = getPatchPaths(serverPath);
  const state = readPatchState(statePath);

  const expectedKey = version.patch_hash ? normalizeHash(version.patch_hash) : undefined;

  // If state says enabled and patch_url matches, consider up-to-date
  if (
    state?.enabled &&
    state.patch_url === version.server_url &&
    (!expectedKey ||
      (state.patch_hash && normalizeHash(state.patch_hash) === expectedKey))
  ) {
    return "up-to-date";
  }

  return "needs";
};

// Unified wrappers that handle both client and server patching

export const enableOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel:
    | "install-progress"
    | "online-patch-progress" = "online-patch-progress",
): Promise<"enabled" | "already-enabled" | "skipped"> => {
  // two downloads one progress bar no regrets
  // Preflight downloads so UI shows combined size when downloading both.
  const wantsServer = !!(version.server_url && version.unserver_url);

  const preflightClientNeedsDownload = async (): Promise<boolean> => {
    const url = version.patch_url;
    const expectedHash = version.patch_hash;
    if (!url || !expectedHash) return false;

    const clientPath = getClientPath(gameDir, version);
    if (!fs.existsSync(clientPath)) return false;

    const paths = getPatchPaths(clientPath);
    const existing = readPatchState(paths.statePath);
    if (!fs.existsSync(paths.patchedPath)) return true;

    if (
      existing?.patch_hash &&
      normalizeHash(existing.patch_hash) !== normalizeHash(expectedHash)
    ) {
      return true;
    }

    try {
      const cachedHash = await sha256File(paths.patchedPath);
      return normalizeHash(cachedHash) !== normalizeHash(expectedHash);
    } catch {
      return true;
    }
  };

  const preflightServerNeedsDownload = async (): Promise<boolean> => {
    if (!wantsServer) return false;

    const serverPath = getServerPath(gameDir, version);
    if (!fs.existsSync(serverPath)) return false;

    const paths = getPatchPaths(serverPath);
    const existing = readPatchState(paths.statePath);
    if (!fs.existsSync(paths.patchedPath)) return true;

    const expectedKey = version.patch_hash
      ? normalizeHash(version.patch_hash)
      : undefined;

    // If we have a client patch hash, require server state to match it.
    if (expectedKey) {
      if (!existing?.patch_hash) return true;
      if (normalizeHash(existing.patch_hash) !== expectedKey) return true;
    }

    return false;
  };

  const needsClientDownload = await preflightClientNeedsDownload();
  const needsServerDownload = await preflightServerNeedsDownload();

  let aggregate: AggregateProgress | undefined;
  if (needsClientDownload || needsServerDownload) {
    // asking the internet how big the internet is
    const sizes = await Promise.all([
      needsClientDownload && version.patch_url
        ? headContentLength(withCacheBuster(version.patch_url, "patch-head"))
        : Promise.resolve(undefined),
      needsServerDownload && version.server_url
        ? headContentLength(withCacheBuster(version.server_url, "server-head"))
        : Promise.resolve(undefined),
    ]);

    const required: Array<number | undefined> = [];
    if (needsClientDownload) required.push(sizes[0]);
    if (needsServerDownload) required.push(sizes[1]);

    let allKnown = true;
    let total = 0;
    for (const n of required) {
      if (typeof n !== "number" || !(n > 0)) {
        allKnown = false;
        continue;
      }
      total += n;
    }

    // if sizes are unknown we pretend everything is fine
    aggregate = { total: allKnown && total > 0 ? total : undefined, current: 0 };
  }

  // First, patch the client
  const clientResult = await enableClientPatch(
    gameDir,
    version,
    win,
    progressChannel,
    aggregate,
  );

  // Then, patch the server if available
  if (wantsServer) {
    await enableServerPatch(gameDir, version, win, progressChannel, aggregate);
  }

  return clientResult;
};

export const disableOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"disabled" | "already-disabled" | "skipped"> => {
  // First, unpatch the client
  const clientResult = await disableClientPatch(
    gameDir,
    version,
    win,
    progressChannel,
  );

  // Then, unpatch the server if available
  if (version.server_url && version.unserver_url) {
    await disableServerPatch(gameDir, version, win, progressChannel);
  }

  return clientResult;
};

export const removeOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"disabled" | "already-disabled" | "skipped"> => {
  // 1) Restore original binaries first.
  const result = await disableOnlinePatch(gameDir, version, win, progressChannel);

  // 2) Then delete patch storage so the launcher treats it as fully removed.
  const roots = new Set<string>();

  try {
    const clientPath = getClientPath(gameDir, version);
    if (fs.existsSync(clientPath)) {
      roots.add(getPatchPaths(clientPath).root);
    }
  } catch {
    // ignore
  }

  try {
    const serverPath = getServerPath(gameDir, version);
    if (fs.existsSync(serverPath)) {
      roots.add(getPatchPaths(serverPath).root);
    }
  } catch {
    // ignore
  }

  if (roots.size) {
    win.webContents.send(progressChannel, {
      phase: "online-unpatch",
      percent: -1,
    });
  }

  for (const root of roots) {
    // Safety belt: only delete folders that are clearly within our patch namespace.
    const resolved = path.resolve(root);
    const marker = `${path.sep}${PATCH_ROOT_DIRNAME}`;
    if (!resolved.includes(marker) && !resolved.endsWith(marker)) continue;
    removeDirIfExists(resolved);
  }

  if (roots.size) {
    win.webContents.send(progressChannel, {
      phase: "online-unpatch",
      percent: 100,
    });
  }

  return result;
};

export const getOnlinePatchState = (
  gameDir: string,
  version: GameVersion,
): {
  supported: boolean;
  available: boolean;
  enabled: boolean;
  downloaded: boolean;
} => {
  const clientState = getClientPatchState(gameDir, version);
  // const serverState = getServerPatchState(gameDir, version);

  // Unified State Logic:
  // - Available: If client patch is available, the feature is available.
  // - Enabled: True if client is enabled (server usually follows client).
  // - Downloaded: True if client is downloaded.

  return {
    supported: clientState.supported,
    available: clientState.available,
    enabled: clientState.enabled,
    downloaded: clientState.downloaded,
  };
};

export const getOnlinePatchHealth = async (
  gameDir: string,
  version: GameVersion,
): Promise<{
  supported: boolean;
  available: boolean;
  enabled: boolean;
  clientIsPatched: boolean;
  serverIsPatched: boolean;
  needsFixClient: boolean;
  needsFixServer: boolean;
  needsFix: boolean; // Aggregated flag
  patchOutdated: boolean;
}> => {
  const clientHealth = await getClientPatchHealth(gameDir, version);
  const serverHealth = await getServerPatchHealth(gameDir, version);

  return {
    supported: clientHealth.supported,
    available: clientHealth.available,
    enabled: clientHealth.enabled,

    // Detailed props
    clientIsPatched: clientHealth.clientIsPatched,
    serverIsPatched: serverHealth.serverIsPatched,
    needsFixClient: clientHealth.needsFixClient,
    needsFixServer: serverHealth.needsFixServer,

    // Aggregates
    needsFix: clientHealth.needsFixClient || serverHealth.needsFixServer,
    patchOutdated: clientHealth.patchOutdated, // Server doesn't usually report outdated hash
  };
};

export const checkOnlinePatchNeeded = async (
  gameDir: string,
  version: GameVersion,
): Promise<"needs" | "up-to-date" | "skipped"> => {
  const clientCheck = await checkClientPatchNeeded(gameDir, version);

  // If client needs update or is skipped, that's the primary signal
  if (clientCheck === "needs") return "needs";
  if (clientCheck === "skipped") return "skipped";

  // If client is up-to-date, we must check the server just in case
  const serverCheck = await checkServerPatchNeeded(gameDir, version);

  if (serverCheck === "needs") return "needs";

  return "up-to-date";
};

export const fixOnlinePatch = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
  progressChannel: "online-unpatch-progress" = "online-unpatch-progress",
): Promise<"fixed" | "not-needed" | "skipped"> => {
  // 1. Fix Client
  const clientResult = await fixClientToUnpatched(
    gameDir,
    version,
    win,
    progressChannel,
  );

  // 2. Fix Server
  // Note: We ignore the return value of server fix unless client was "not-needed",
  // effectively OR-ing the results.
  const serverResult = await fixServerToUnpatched(
    gameDir,
    version,
    win,
    progressChannel,
  );

  if (clientResult === "fixed" || serverResult === "fixed") {
    return "fixed";
  }

  if (clientResult === "skipped" && serverResult === "skipped") {
    return "skipped";
  }

  return "not-needed";
};
