import { BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import stream from "node:stream";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import extract from "extract-zip";
import * as tar from "tar";
import { logger } from "../logger";
import { formatErrorWithHints } from "../errorHints";

export type JreInstallResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

type ArchObj = {
  url: string;
  sha256: string;
};

type JRE = {
  version: string;
  download_url: {
    linux: {
      amd64: ArchObj;
    };
    darwin: {
      arm64: ArchObj;
    };
    windows: {
      amd64: ArchObj;
    };
  };
};

const JRE_URL = "https://launcher.hytale.com/version/release/jre.json";

export const installJRE = async (
  gameDir: string,
  win: BrowserWindow,
): Promise<JreInstallResult> => {
  const os = process.platform;
  let downloadUrl: string | null = null;
  let jreCompressedPath: string | null = null;

  try {
    logger.info(`Fetching JRE manifest from ${JRE_URL}`);
    const response = await fetch(JRE_URL);
    if (!response.ok) {
      const { userMessage, meta } = formatErrorWithHints(
        new Error(`HTTP ${response.status} ${response.statusText}`),
        { op: "Fetch JRE manifest", url: JRE_URL, status: response.status },
      );
      logger.error("JRE manifest fetch failed", meta);
      return { ok: false, error: userMessage };
    }
    const jre: JRE = await response.json();

    let downloadHash: string | null = null;
    let platformKey: string = "";

    if (os === "win32") {
      platformKey = "windows/amd64";
      jreCompressedPath = path.join(
        gameDir,
        jre.download_url.windows.amd64.url.split("/").pop()!,
      );

      downloadUrl = jre.download_url.windows.amd64.url;
      downloadHash = jre.download_url.windows.amd64.sha256;
    } else if (os === "linux") {
      platformKey = "linux/amd64";
      jreCompressedPath = path.join(
        gameDir,
        jre.download_url.linux.amd64.url.split("/").pop()!,
      );

      downloadUrl = jre.download_url.linux.amd64.url;
      downloadHash = jre.download_url.linux.amd64.sha256;
    } else if (os === "darwin") {
      platformKey = "darwin/arm64";
      jreCompressedPath = path.join(
        gameDir,
        jre.download_url.darwin.arm64.url.split("/").pop()!,
      );

      downloadUrl = jre.download_url.darwin.arm64.url;
      downloadHash = jre.download_url.darwin.arm64.sha256;
    }

    if (!downloadUrl || !downloadHash || !jreCompressedPath)
      throw new Error(`Failed to find JRE for platform: ${os}`);

    logger.info(`Selected JRE for ${platformKey}: ${downloadUrl}`);

    if (fs.existsSync(jreCompressedPath)) {
      logger.info(
        `JRE archive already exists at ${jreCompressedPath}, verifying hash...`,
      );
      const verifyResult = await verifyJRE(jreCompressedPath, downloadHash);
      if (verifyResult) {
        logger.info("Existing JRE archive verified successfully.");
        // JRE is already downloaded and verified
        const extractResult = await extractJRE(jreCompressedPath, gameDir, win);
        if (!extractResult) throw new Error("Failed to extract verified JRE");

        return { ok: true, path: extractResult };
      }
      logger.warn("Existing JRE archive hash mismatch, re-downloading.");
    }

    logger.info(`Downloading JRE from ${downloadUrl}`);
    const resFile = await fetch(downloadUrl);
    if (!resFile.ok) {
      const { userMessage, meta } = formatErrorWithHints(
        new Error(`HTTP ${resFile.status} ${resFile.statusText}`),
        {
          op: "Download JRE",
          url: downloadUrl,
          filePath: jreCompressedPath,
          status: resFile.status,
        },
      );
      logger.error("JRE download failed", meta);
      return { ok: false, error: userMessage };
    }
    const contentLength = resFile.headers.get("content-length");
    const totalLength = contentLength ? parseInt(contentLength, 10) : undefined;
    let downloadedLength = 0;

    logger.info(
      `JRE size: ${totalLength ? (totalLength / 1024 / 1024).toFixed(2) + " MB" : "unknown"}`,
    );

    win.webContents.send("install-progress", {
      phase: "jre-download",
      percent: typeof totalLength === "number" && totalLength > 0 ? 0 : -1,
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
          ? Math.round(
              (downloadedLength / totalLength) * (os === "win32" ? 80 : 100),
            )
          : -1;

      win.webContents.send("install-progress", {
        phase: "jre-download",
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
        stream.Readable.fromWeb(resFile.body),
        progressStream,
        fs.createWriteStream(jreCompressedPath),
      );
    } catch (e) {
      const { userMessage, meta } = formatErrorWithHints(e, {
        op: "Save JRE archive",
        url: downloadUrl,
        filePath: jreCompressedPath,
      });
      logger.error("JRE write/pipeline failed", meta, e);
      return { ok: false, error: userMessage };
    }

    logger.info(`JRE download completed: ${jreCompressedPath}`);

    win.webContents.send("install-progress", {
      phase: "jre-download",
      percent: 100,
      total: totalLength,
      current: downloadedLength,
    });

    const verifyResult = await verifyJRE(jreCompressedPath, downloadHash);
    if (!verifyResult) {
      const { userMessage, meta } = formatErrorWithHints(
        new Error("sha256 mismatch"),
        { op: "Verify JRE archive hash", filePath: jreCompressedPath },
      );
      logger.error("JRE hash mismatch", meta);
      return { ok: false, error: userMessage };
    }
    logger.info("JRE hash verified.");

    const extractResult = await extractJRE(jreCompressedPath, gameDir, win);
    if (!extractResult) {
      const { userMessage, meta } = formatErrorWithHints(
        new Error("extract failed"),
        { op: "Extract JRE", filePath: jreCompressedPath, dirPath: path.join(gameDir, "jre") },
      );
      logger.error("JRE extract failed", meta);
      return { ok: false, error: userMessage };
    }

    return { ok: true, path: extractResult };
  } catch (error) {
    const { userMessage, meta } = formatErrorWithHints(error, {
      op: "Install JRE",
      url: downloadUrl ?? undefined,
      filePath: jreCompressedPath ?? undefined,
      dirPath: gameDir,
    });
    logger.error("Failed to install JRE", meta, error);
    return { ok: false, error: userMessage };
  }
};

export const verifyJRE = async (jrePath: string, downloadHash: string) => {
  const hash = crypto.createHash("sha256");
  const fileStream = fs.createReadStream(jrePath);
  fileStream.on("data", (chunk) => hash.update(chunk));
  await new Promise((resolve, reject) => {
    fileStream.on("end", () => resolve(true));
    fileStream.on("error", reject);
  });
  const fileHash = hash.digest("hex");
  return fileHash === downloadHash;
};

export const extractJRE = async (
  jreCompressedPath: string,
  gameDir: string,
  win: BrowserWindow,
) => {
  try {
    const jreDir = path.join(gameDir, "jre");
    logger.info(`Extracting JRE from ${jreCompressedPath} to ${jreDir}`);
    if (fs.existsSync(jreDir)) {
      logger.info(`Removing existing JRE directory: ${jreDir}`);
      fs.rmSync(jreDir, { recursive: true, force: true });
    }
    fs.mkdirSync(jreDir, { recursive: true });
    logger.info(`Created JRE directory: ${jreDir}`);

    if (jreCompressedPath.endsWith(".tar.gz")) {
      win.webContents.send("install-progress", {
        phase: "jre-extract",
        percent: -1,
      });

      logger.info(
        `Executing tar extract for JRE archive: ${jreCompressedPath}`,
      );
      await tar.x({
        file: jreCompressedPath,
        cwd: jreDir,
        strip: 1,
      });
      logger.info("Tar extraction completed.");
    } else {
      let extractedEntries = 0;
      await extract(jreCompressedPath, {
        dir: jreDir,
        onEntry: (_, zipfile) => {
          extractedEntries++;
          const totalEntries = zipfile.entryCount;
          const percentage = 80 + (extractedEntries / totalEntries) * 20;
          win.webContents.send("install-progress", {
            phase: "jre-extract",
            percent: Math.round(percentage),
            total: totalEntries,
            current: extractedEntries,
          });
        },
      });

      logger.info(
        `Zip extraction completed. Extracted ${extractedEntries} entries.`,
      );

      // move files from subdirectory to root

      const files = fs.readdirSync(jreDir);
      const subDir = files.find(
        (f) =>
          !f.startsWith(".") && fs.statSync(path.join(jreDir, f)).isDirectory(),
      );

      if (subDir) {
        logger.info(`Moving files from subdirectory ${subDir} to JRE root.`);
        const subDirPath = path.join(jreDir, subDir);
        const subFiles = fs.readdirSync(subDirPath);
        for (const file of subFiles) {
          fs.renameSync(path.join(subDirPath, file), path.join(jreDir, file));
        }
        // remove subdirectory
        fs.rmSync(subDirPath, { recursive: true });
      }
    }

    const os = process.platform;
    const javaCandidates =
      os === "win32" ? ["java.exe", "javaw.exe"] : ["java"];

    const resolveJavaInRoot = () => {
      const binDir = path.join(jreDir, "bin");
      return javaCandidates
        .map((name) => path.join(binDir, name))
        .find((candidate) => fs.existsSync(candidate));
    };

    const findJavaRecursively = (rootDir: string, maxDepth = 6) => {
      const queue: Array<{ dir: string; depth: number }> = [
        { dir: rootDir, depth: 0 },
      ];

      while (queue.length) {
        const { dir, depth } = queue.shift()!;
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          continue;
        }

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "__MACOSX") continue;
            if (depth < maxDepth)
              queue.push({ dir: fullPath, depth: depth + 1 });
            continue;
          }

          if (!javaCandidates.includes(entry.name)) continue;
          // Ensure it's under a 'bin' directory (typical JRE/JDK layout)
          if (path.basename(path.dirname(fullPath)).toLowerCase() !== "bin")
            continue;
          return fullPath;
        }
      }

      return undefined;
    };

    const normalizeJreLayout = () => {
      // Some archives ship as jdk-*/jre/bin/java(.exe) or similar nested structure.
      // If we can locate a java binary under */bin/java(.exe), move that root up to jreDir.
      const found = findJavaRecursively(jreDir);
      if (!found) {
        logger.warn(
          "Could not find java executable during JRE layout normalization.",
        );
        return;
      }

      logger.info(`Found java executable at ${found}. Normalizing layout.`);

      const foundBinDir = path.dirname(found);
      const foundRoot = path.dirname(foundBinDir);
      if (path.resolve(foundRoot) === path.resolve(jreDir)) {
        logger.info("JRE layout is already normalized.");
        return;
      }

      logger.info(`Moving JRE root from ${foundRoot} to ${jreDir}`);

      const children = fs.readdirSync(foundRoot);
      for (const child of children) {
        const from = path.join(foundRoot, child);
        const to = path.join(jreDir, child);
        if (path.resolve(from) === path.resolve(to)) continue;
        try {
          if (fs.existsSync(to))
            fs.rmSync(to, { recursive: true, force: true });
          fs.renameSync(from, to);
        } catch (err) {
          logger.error(`Failed to move ${from} to ${to}:`, err);
        }
      }
    };

    normalizeJreLayout();
    const jrePath = resolveJavaInRoot();
    if (!jrePath)
      throw new Error("Failed to resolve java binary after extraction");

    logger.info(
      `JRE extraction and normalization successful. JRE path: ${jrePath}`,
    );

    fs.unlinkSync(jreCompressedPath);
    logger.info(`Deleted JRE archive: ${jreCompressedPath}`);

    return jrePath;
  } catch (error) {
    logger.error("Failed to extract JRE:", error);
    return null;
  }
};
