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
import { formatErrorWithHints } from "../errorHints";
import { mapErrorToCode } from "../errorCodes";

import {
  getLatestDir,
  getReleaseBuildDir,
  migrateLegacyChannelInstallIfNeeded,
  resolveClientPath,
  resolveInstallDir,
} from "./paths";

const pipeline = promisify(stream.pipeline);

// Butler .pwr patches use a protobuf-based wire format.
// The first 8 bytes are a "magic" header: 0xc1 0x53 0x50 0x00 ("PWR\0" with high bit)
// followed by a 32-bit message type.  In practice the first two bytes are never
// 0x4d 0x5a ("MZ" – PE executables), 0x7f 0x45 ("ELF"), 0xcf 0xfa (Mach-O 64),
// or 0x50 0x4b ("PK" – ZIP).  We check for the known butler magic to decide
// whether the download is a patch file or a raw game binary.
const BUTLER_PWR_MAGIC = Buffer.from([0xc1, 0x53, 0x50, 0x00]);

const isButlerPatch = (filePath: string): boolean => {
  try {
    const fd = fs.openSync(filePath, "r");
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    return buf.equals(BUTLER_PWR_MAGIC);
  } catch {
    return false;
  }
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
  const st = pwrDownloadsInFlight.get(key);
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
    const response = await fetch(version.url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.body) throw new Error("No response body");

    const contentLength = response.headers.get("content-length");
    const totalLength = contentLength ? parseInt(contentLength, 10) : undefined;
    let downloadedLength = 0;

    logger.info(
      `PWR size: ${totalLength ? (totalLength / 1024 / 1024).toFixed(2) + " MB" : "unknown"}`,
    );

    // Emit a start event so UI doesn't show 0/0.
    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: totalLength ? 0 : -1,
      total: totalLength,
      current: 0,
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

    logger.info(`PWR download completed: ${tempPWRPath}`);

    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: 100,
      total: totalLength,
      current: downloadedLength,
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
    let stderrBuf = "";
    const butlerProcess = spawn(
      butlerPath,
      ["apply", "--json", "--staging-dir", stagingDir, pwrPath, installDir],
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
      const chunk = data.toString();
      // Keep a bounded snippet for error reporting
      if (stderrBuf.length < 8192) stderrBuf += chunk;
      logger.error(`Butler stderr: ${chunk.trim()}`);
    });

    butlerProcess.on("close", (code) => {
      logger.info(`Butler process exited with code ${code}`);

      // Force a final UI update so it doesn't stay stuck on "Downloading...".
      win.webContents.send("install-progress", {
        phase: "patching",
        percent: 100,
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

      resolve(installDir);
    });
  });
};

/**
 * Handle a downloaded file that is a raw game binary (not a butler .pwr patch).
 * Places it directly into installDir/Client/ with the correct name.
 */
const installRawBinary = (
  downloadedPath: string,
  installDir: string,
  version: GameVersion,
  win: BrowserWindow,
): string => {
  logger.info(
    `Downloaded file is a raw binary, not a butler patch. Installing directly to ${installDir}`,
  );

  win.webContents.send("install-progress", {
    phase: "patching",
    percent: -1,
  });

  const clientDir = path.join(installDir, "Client");
  fs.mkdirSync(clientDir, { recursive: true });

  // Determine destination filename from the download URL or sensible default.
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";
  const defaultName = isWin
    ? "HytaleClient.exe"
    : isMac
      ? "HytaleClient.app"
      : "HytaleClient";

  const urlFilename = version.url
    ? path.basename(new URL(version.url).pathname)
    : undefined;
  const destName = urlFilename || defaultName;
  const destPath = path.join(clientDir, destName);

  fs.copyFileSync(downloadedPath, destPath);
  logger.info(`Raw binary installed to ${destPath}`);

  win.webContents.send("install-progress", {
    phase: "patching",
    percent: 100,
  });

  return installDir;
};

/**
 * Download the server jar when the manifest provides a server_url.
 * Places it at installDir/Server/HytaleServer.jar.
 */
const downloadServerJar = async (
  version: GameVersion,
  installDir: string,
  win: BrowserWindow,
) => {
  if (!version.server_url) return;
  if (process.platform === "darwin") return; // macOS doesn't need a server

  const serverDir = path.join(installDir, "Server");
  const destPath = path.join(serverDir, "HytaleServer.jar");

  if (fs.existsSync(destPath)) {
    logger.info("Server jar already exists, skipping download.");
    return;
  }

  logger.info(`Downloading server jar from ${version.server_url}`);
  fs.mkdirSync(serverDir, { recursive: true });

  const response = await fetch(version.server_url);
  if (!response.ok) {
    throw new Error(`Server jar download failed: HTTP ${response.status} ${response.statusText}`);
  }
  if (!response.body) throw new Error("No response body for server jar");

  win.webContents.send("install-progress", {
    phase: "server-download",
    percent: -1,
  });

  await pipeline(
    // @ts-ignore
    stream.Readable.fromWeb(response.body),
    fs.createWriteStream(destPath),
  );

  logger.info(`Server jar installed to ${destPath}`);
};

export const installGame = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  logger.info(
    `Starting game installation for ${version.type} build ${version.build_name} in ${gameDir}`,
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
            `Retiring existing 'latest' build ${existing.build_index} to release builds.`,
          );
          const targetBuildDir = getReleaseBuildDir(
            gameDir,
            existing.build_index,
          );
          if (fs.existsSync(targetBuildDir)) {
            logger.info(
              `Target build directory ${targetBuildDir} already exists, deleting legacy 'latest'.`,
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
      const jreRes = await installJRE(gameDir, win);
      if (!jreRes.ok) throw new Error(jreRes.error);
      logger.info(`JRE installed at ${jreRes.path}`);
    }

    // If binaries exist but build differs, we must still apply the new PWR.
    // Only skip the patching step when we *know* we're already on this build.
    if (!alreadyOnThisBuild) {
      logger.info(
        `New build detected (target: ${version.build_index}, current: ${installedManifest?.build_index ?? "none"}). Starting patch process.`,
      );

      const tempDownloadPath = await downloadPWR(gameDir, version, win);

      let gameFinalDir: string;
      if (isButlerPatch(tempDownloadPath)) {
        logger.info("Downloaded file is a butler patch, applying with butler.");
        const butlerRes = await installButler();
        if (!butlerRes.ok) throw new Error(butlerRes.error);

        gameFinalDir = await applyPWR(
          tempDownloadPath,
          butlerRes.path,
          installDir,
          win,
        );
      } else {
        gameFinalDir = installRawBinary(
          tempDownloadPath,
          installDir,
          version,
          win,
        );
      }
      if (!gameFinalDir) throw new Error("Failed to install game");
      logger.info(`Game installed successfully to ${gameFinalDir}`);

      fs.unlinkSync(tempDownloadPath);

      // Record the installed build so future updates can detect when patching is needed.
      writeInstallManifest(installDir, version);

      // On Linux/macOS, downloaded binaries may lose the executable bit.
      ensureClientExecutable(installDir);

      // Download server jar if available and not already present.
      await downloadServerJar(version, installDir, win);

      logger.info("Game installation complete.");
    } else {
      // If the manifest says it's installed, but binaries are missing, fall back to patching.
      // This keeps us safe against partial installs.
      if (!client || !server) {
        logger.warn(
          "Manifest indicates installation, but client or server binaries are missing. Re-installing.",
        );

        const tempDownloadPath = await downloadPWR(gameDir, version, win);

        let gameFinalDir: string;
        if (isButlerPatch(tempDownloadPath)) {
          logger.info("Downloaded file is a butler patch, applying with butler.");
          const butlerRes = await installButler();
          if (!butlerRes.ok) throw new Error(butlerRes.error);

          gameFinalDir = await applyPWR(
            tempDownloadPath,
            butlerRes.path,
            installDir,
            win,
          );
        } else {
          gameFinalDir = installRawBinary(
            tempDownloadPath,
            installDir,
            version,
            win,
          );
        }
        if (!gameFinalDir) throw new Error("Failed to install game");
        logger.info(`Game re-installed successfully to ${gameFinalDir}`);
        fs.unlinkSync(tempDownloadPath);

        writeInstallManifest(installDir, version);

        ensureClientExecutable(installDir);

        // Download server jar if available and not already present.
        await downloadServerJar(version, installDir, win);

        logger.info("Game re-installation complete.");
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

    const code = mapErrorToCode(error, { area: "install" });
    logger.error("Installation failed", { code }, error);
    // UI shows only the numeric code; full details are in logs.
    win.webContents.send("install-error", { code });
    return false;
  }
};
