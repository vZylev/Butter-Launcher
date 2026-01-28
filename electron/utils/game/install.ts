import { BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import stream from "stream";
import { spawn } from "child_process";
import readline from "node:readline";
import { installButler } from "./butler";
import { installJRE } from "./jre";
import { checkGameInstallation } from "./check";
import { readInstallManifest, writeInstallManifest } from "./manifest";
import { logger } from "../logger";

import {
  getLatestDir,
  getReleaseBuildDir,
  migrateLegacyChannelInstallIfNeeded,
  resolveClientPath,
  resolveInstallDir,
} from "./paths";

const pipeline = promisify(stream.pipeline);

// ============================================================================
// RESUMABLE DOWNLOAD INFRASTRUCTURE
// ============================================================================

/**
 * Metadata stored for each in-progress download to enable resumption.
 */
type DownloadMetadata = {
  url: string;
  expectedSize?: number;
  downloadedBytes: number;
  lastModified: string; // ISO timestamp
  etag?: string; // Server ETag for validation
};

/**
 * Resume-aware download state tracker
 */
type ResumeState = {
  metadataPath: string;
  tempPath: string;
  metadata: DownloadMetadata | null;
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

/**
 * Generate stable paths for download temp file and metadata
 */
const getDownloadPaths = (
  gameDir: string,
  version: GameVersion
): { tempPath: string; metadataPath: string } => {
  // Use stable filename (no timestamp) so we can resume across sessions
  const basename = `build-${version.build_index}_${version.type}`;
  const tempPath = path.join(gameDir, `${basename}.pwr.download`);
  const metadataPath = path.join(gameDir, `${basename}.pwr.meta.json`);
  
  return { tempPath, metadataPath };
};

/**
 * Load download metadata from disk if it exists
 */
const loadDownloadMetadata = (metadataPath: string): DownloadMetadata | null => {
  try {
    if (!fs.existsSync(metadataPath)) return null;
    const raw = fs.readFileSync(metadataPath, "utf8");
    const parsed = JSON.parse(raw);
    
    // Validate structure
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.url !== "string") return null;
    if (typeof parsed.downloadedBytes !== "number") return null;
    if (typeof parsed.lastModified !== "string") return null;
    
    return parsed as DownloadMetadata;
  } catch (err) {
    logger.warn("Failed to load download metadata:", err);
    return null;
  }
};

/**
 * Save download metadata to disk for resume capability
 */
const saveDownloadMetadata = (
  metadataPath: string,
  metadata: DownloadMetadata
): void => {
  try {
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  } catch (err) {
    logger.error("Failed to save download metadata:", err);
  }
};

/**
 * Clean up download artifacts (temp file + metadata)
 */
const cleanupDownload = (tempPath: string, metadataPath: string): void => {
  try {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  } catch (err) {
    logger.warn("Failed to delete temp file:", err);
  }
  
  try {
    if (fs.existsSync(metadataPath)) fs.unlinkSync(metadataPath);
  } catch (err) {
    logger.warn("Failed to delete metadata file:", err);
  }
};

/**
 * Get the current size of a partially downloaded file
 */
const getPartialFileSize = (filePath: string): number => {
  try {
    if (!fs.existsSync(filePath)) return 0;
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch {
    return 0;
  }
};

/**
 * Validate if a partial download can be resumed
 */
const canResumeDownload = (
  url: string,
  tempPath: string,
  metadata: DownloadMetadata | null
): { canResume: boolean; startByte: number } => {
  if (!metadata || metadata.url !== url) {
    return { canResume: false, startByte: 0 };
  }
  
  const fileSize = getPartialFileSize(tempPath);
  
  // File doesn't exist or is empty
  if (fileSize === 0) {
    return { canResume: false, startByte: 0 };
  }
  
  // File size doesn't match metadata
  if (fileSize !== metadata.downloadedBytes) {
    logger.warn(
      `File size mismatch: expected ${metadata.downloadedBytes}, got ${fileSize}`
    );
    return { canResume: false, startByte: 0 };
  }
  
  // Metadata is too old (>7 days)
  const metaAge = Date.now() - new Date(metadata.lastModified).getTime();
  const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  if (metaAge > MAX_AGE) {
    logger.info("Metadata too old, starting fresh download");
    return { canResume: false, startByte: 0 };
  }
  
  return { canResume: true, startByte: fileSize };
};

export const cancelBuildDownload = (
  gameDir: string,
  version: GameVersion
): boolean => {
  const key = installKey(gameDir, version);
  const st = pwrDownloadsInFlight.get(key);
  if (!st) return false;

  try {
    st.controller.abort();
  } catch {
    // ignore
  }

  // CHANGED: Don't delete the partial file - keep it for resume
  // The metadata will track how much was downloaded
  logger.info("Download cancelled, partial file preserved for resume");

  return true;
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

// ============================================================================
// RESUMABLE DOWNLOAD IMPLEMENTATION
// ============================================================================

/**
 * Download a PWR file with full resume support across sessions
 */
const downloadPWR = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow
): Promise<string | null> => {
  const { tempPath, metadataPath } = getDownloadPaths(gameDir, version);
  const key = installKey(gameDir, version);
  const controller = new AbortController();

  // Load existing metadata if available
  const existingMetadata = loadDownloadMetadata(metadataPath);
  const resumeInfo = canResumeDownload(version.url, tempPath, existingMetadata);
  
  const startByte = resumeInfo.canResume ? resumeInfo.startByte : 0;
  const isResuming = startByte > 0;

  if (isResuming) {
    logger.info(
      `Resuming download for ${version.build_name} from byte ${startByte}`
    );
  } else {
    logger.info(
      `Starting fresh download for ${version.build_name} from ${version.url}`
    );
    // Clean up any stale files
    cleanupDownload(tempPath, metadataPath);
  }

  // yes this is global state and yes it will haunt us later
  pwrDownloadsInFlight.set(key, { controller, tempPath });

  try {
    // Prepare Range request headers for resume
    const headers: Record<string, string> = {};
    if (isResuming && existingMetadata?.etag) {
      headers["If-Range"] = existingMetadata.etag;
    }
    if (isResuming) {
      headers["Range"] = `bytes=${startByte}-`;
    }

    const response = await fetch(version.url, {
      signal: controller.signal,
      headers,
    });

    // Handle different response codes
    if (response.status === 416) {
      // Range not satisfiable - file is complete or corrupted
      logger.warn("Range not satisfiable, starting fresh download");
      cleanupDownload(tempPath, metadataPath);
      // Retry without range
      return downloadPWR(gameDir, version, win);
    }

    if (response.status === 200 && isResuming) {
      // Server doesn't support resume, starting fresh
      logger.info("Server doesn't support resume (200 instead of 206), starting fresh");
      cleanupDownload(tempPath, metadataPath);
    }

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const contentLength = response.headers.get("content-length");
    const etag = response.headers.get("etag") || undefined;
    
    // Calculate total size
    let totalLength: number | undefined;
    if (response.status === 206) {
      // Partial content - add resumed bytes
      totalLength = contentLength ? parseInt(contentLength, 10) + startByte : undefined;
    } else {
      // Full download
      totalLength = contentLength ? parseInt(contentLength, 10) : undefined;
    }
    
    let downloadedLength = startByte;

    logger.info(
      `PWR size: ${totalLength ? (totalLength / 1024 / 1024).toFixed(2) + " MB" : "unknown"}${
        isResuming ? ` (resuming from ${(startByte / 1024 / 1024).toFixed(2)} MB)` : ""
      }`
    );

    // Determine write mode
    const writeStream = response.status === 206
      ? fs.createWriteStream(tempPath, { flags: "a" }) // Append mode
      : fs.createWriteStream(tempPath); // Overwrite mode

    // Emit initial progress
    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: totalLength ? Math.round((downloadedLength / totalLength) * 100) : 0,
      total: totalLength,
      current: downloadedLength,
    });

    // Track progress with metadata updates
    const progressStream = new stream.PassThrough();
    let lastMetadataSave = Date.now();
    const METADATA_SAVE_INTERVAL = 2000; // Save every 2 seconds

    progressStream.on("data", (chunk) => {
      downloadedLength += chunk.length;

      const percent =
        typeof totalLength === "number" && totalLength > 0
          ? Math.round((downloadedLength / totalLength) * 100)
          : -1;

      win.webContents.send("install-progress", {
        phase: "pwr-download",
        percent,
        total: totalLength,
        current: downloadedLength,
      });

      // Periodically save metadata for resume
      const now = Date.now();
      if (now - lastMetadataSave >= METADATA_SAVE_INTERVAL) {
        saveDownloadMetadata(metadataPath, {
          url: version.url,
          expectedSize: totalLength,
          downloadedBytes: downloadedLength,
          lastModified: new Date().toISOString(),
          etag,
        });
        lastMetadataSave = now;
      }
    });

    await pipeline(
      // @ts-ignore
      stream.Readable.fromWeb(response.body),
      progressStream,
      writeStream
    );

    logger.info(`PWR download completed: ${tempPath}`);

    // Final metadata save
    saveDownloadMetadata(metadataPath, {
      url: version.url,
      expectedSize: totalLength,
      downloadedBytes: downloadedLength,
      lastModified: new Date().toISOString(),
      etag,
    });

    // Verify file size matches expected
    const finalSize = getPartialFileSize(tempPath);
    if (totalLength && finalSize !== totalLength) {
      logger.warn(
        `Downloaded file size mismatch: expected ${totalLength}, got ${finalSize}`
      );
      // Don't throw - let butler validation catch corruption
    }

    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: 100,
      total: totalLength,
      current: downloadedLength,
    });

    return tempPath;
  } catch (error) {
    // user asked to cancel so we pretend this was always supported
    if (
      controller.signal.aborted ||
      (error && typeof error === "object" && (error as any).name === "AbortError")
    ) {
      // Save final metadata state for resume
      const currentSize = getPartialFileSize(tempPath);
      if (currentSize > 0) {
        saveDownloadMetadata(metadataPath, {
          url: version.url,
          expectedSize: existingMetadata?.expectedSize,
          downloadedBytes: currentSize,
          lastModified: new Date().toISOString(),
          etag: existingMetadata?.etag,
        });
        logger.info(
          `Download cancelled, saved ${(currentSize / 1024 / 1024).toFixed(2)} MB for resume`
        );
      }
      throw new UserCancelledError();
    }

    logger.error(
      `Failed to download PWR for version ${version.build_name}:`,
      error
    );
    
    // On error, save metadata for potential resume
    const currentSize = getPartialFileSize(tempPath);
    if (currentSize > 0) {
      saveDownloadMetadata(metadataPath, {
        url: version.url,
        expectedSize: existingMetadata?.expectedSize,
        downloadedBytes: currentSize,
        lastModified: new Date().toISOString(),
        etag: existingMetadata?.etag,
      });
    }
    
    return null;
  } finally {
    pwrDownloadsInFlight.delete(key);
  }
};

const applyPWR = async (
  pwrPath: string,
  butlerPath: string,
  installDir: string,
  win: BrowserWindow
) => {
  logger.info(`Applying PWR patch from ${pwrPath} to ${installDir}`);
  const stagingDir = path.join(installDir, "staging-temp");
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
  });

  return new Promise<string>((resolve, reject) => {
    const butlerProcess = spawn(
      butlerPath,
      ["apply", "--json", "--staging-dir", stagingDir, pwrPath, installDir],
      {
        windowsHide: true,
      }
    ).on("error", (error) => {
      logger.error(
        "Butler process failed to start or encountered a critical error:",
        error
      );
      reject(error);
    });

    // Try to surface butler progress in the UI.
    // Butler emits JSON lines when using --json.
    if (butlerProcess.stdout) {
      const rl = readline.createInterface({
        input: butlerProcess.stdout,
        crlfDelay: Infinity,
      });
      rl.on("line", (line) => {
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
      logger.error(`Butler stderr: ${data.toString().trim()}`);
    });

    butlerProcess.on("close", (code) => {
      logger.info(`Butler process exited with code ${code}`);

      // Force a final UI update so it doesn't stay stuck on "Downloading...".
      win.webContents.send("install-progress", {
        phase: "patching",
        percent: 100,
      });

      resolve(installDir);
    });
  });
};

export const installGame = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow
) => {
  logger.info(
    `Starting game installation for ${version.type} build ${version.build_name} in ${gameDir}`
  );
  try {
    migrateLegacyChannelInstallIfNeeded(gameDir, version.type);

    // If installing the latest release, and an older latest exists, move it into release/build-N.
    if (version.type === "release" && version.isLatest) {
      const latestDir = getLatestDir(gameDir);
      if (fs.existsSync(latestDir)) {
        const existing = readInstallManifest(latestDir);
        if (existing && existing.build_index !== version.build_index) {
          logger.info(
            `Retiring existing 'latest' build ${existing.build_index} to release builds.`
          );
          const targetBuildDir = getReleaseBuildDir(
            gameDir,
            existing.build_index
          );
          if (fs.existsSync(targetBuildDir)) {
            logger.info(
              `Target build directory ${targetBuildDir} already exists, deleting legacy 'latest'.`
            );
            // Already installed elsewhere; remove latest to free the alias.
            fs.rmSync(latestDir, { recursive: true, force: true });
          } else {
            logger.info(`Moving 'latest' to ${targetBuildDir}`);
            fs.mkdirSync(path.dirname(targetBuildDir), { recursive: true });
            fs.renameSync(latestDir, targetBuildDir);
          }
        }
      }
    }

    const installDir = resolveInstallDir(gameDir, version);

    const { client, server, jre } = checkGameInstallation(gameDir, version);

    const installedManifest = readInstallManifest(installDir);
    const alreadyOnThisBuild =
      installedManifest?.build_index === version.build_index;

    fs.mkdirSync(gameDir, { recursive: true });
    win.webContents.send("install-started");

    if (!jre) {
      logger.info("JRE not found, installing JRE...");
      const jrePath = await installJRE(gameDir, win);
      if (!jrePath) throw new Error("Failed to install JRE");
      logger.info(`JRE installed at ${jrePath}`);
    }

    // If binaries exist but build differs, we must still apply the new PWR.
    // Only skip the patching step when we *know* we're already on this build.
    if (!alreadyOnThisBuild) {
      logger.info(
        `New build detected (target: ${version.build_index}, current: ${installedManifest?.build_index ?? "none"}). Starting patch process.`
      );
      const butlerPath = await installButler();
      if (!butlerPath) throw new Error("Failed to install butler");

      const tempPWRPath = await downloadPWR(gameDir, version, win);
      if (!tempPWRPath) throw new Error("Failed to download PWR");

      const gameFinalDir = await applyPWR(
        tempPWRPath,
        butlerPath,
        installDir,
        win
      );
      if (!gameFinalDir) throw new Error("Failed to apply PWR");
      logger.info(`PWR patch applied successfully to ${gameFinalDir}`);

      // Clean up download artifacts after successful installation
      const { tempPath, metadataPath } = getDownloadPaths(gameDir, version);
      cleanupDownload(tempPath, metadataPath);
      logger.info("Cleaned up download artifacts");

      // Record the installed build so future updates can detect when patching is needed.
      writeInstallManifest(installDir, version);

      // On Linux/macOS, downloaded binaries may lose the executable bit.
      ensureClientExecutable(installDir);
      logger.info("Game installation and patching complete.");
    } else {
      // If the manifest says it's installed, but binaries are missing, fall back to patching.
      // This keeps us safe against partial installs.
      if (!client || !server) {
        logger.warn(
          "Manifest indicates installation, but client or server binaries are missing. Re-patching."
        );
        const butlerPath = await installButler();
        if (!butlerPath) throw new Error("Failed to install butler");

        const tempPWRPath = await downloadPWR(gameDir, version, win);
        if (!tempPWRPath) throw new Error("Failed to download PWR");

        const gameFinalDir = await applyPWR(
          tempPWRPath,
          butlerPath,
          installDir,
          win
        );
        if (!gameFinalDir) throw new Error("Failed to apply PWR");
        logger.info(`PWR patch re-applied successfully to ${gameFinalDir}`);
        
        // Clean up download artifacts
        const { tempPath, metadataPath } = getDownloadPaths(gameDir, version);
        cleanupDownload(tempPath, metadataPath);

        writeInstallManifest(installDir, version);

        ensureClientExecutable(installDir);
        logger.info("Game re-patching complete.");
      } else {
        logger.info("Game already installed and binaries verified.");
      }
    }

    logger.info("Game installation process finished successfully.");

    win.webContents.send("install-finished", version);
    return true;
  } catch (error) {
    if (error instanceof UserCancelledError) {
      logger.info("Install cancelled by user");
      win.webContents.send("install-cancelled");
      return false;
    }

    logger.error("Installation failed with error:", error);
    win.webContents.send(
      "install-error",
      error instanceof Error ? error.message : "Unknown error"
    );
    return false;
  }
};

