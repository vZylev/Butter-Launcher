import { META_DIRECTORY } from "../const";
import path from "node:path";
import fs from "node:fs";
import extract from "extract-zip";
import { logger } from "../logger";
import { formatErrorWithHints } from "../errorHints";

export type ToolInstallResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export const installButler = async (): Promise<ToolInstallResult> => {
  logger.info("Checking for Butler tool...");
  const butlerPath = path.join(META_DIRECTORY, "tools", "butler");
  const zipPath = path.join(butlerPath, "butler.zip");
  const binPath = path.join(
    butlerPath,
    process.platform === "win32" ? "butler.exe" : "butler",
  );

  let downloadUrl: string | null = null;

  try {
    if (!fs.existsSync(butlerPath)) {
      fs.mkdirSync(butlerPath, { recursive: true });
    }

    // check if butler is already installed
    if (fs.existsSync(binPath)) {
      logger.info(`Butler already installed at ${binPath}`);
      return { ok: true, path: binPath };
    }

    logger.info(`Butler not found, installing to ${butlerPath}...`);

    // download butler
    const url: Record<string, string> = {
      win32:
        "https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default",
      linux:
        "https://broth.itch.zone/butler/linux-amd64/LATEST/archive/default",
      darwin:
        "https://broth.itch.zone/butler/darwin-amd64/LATEST/archive/default",
    };
    if (!url[process.platform]) {
      throw new Error(`Unsupported platform for butler: ${process.platform}`);
    }

    downloadUrl = url[process.platform];
    logger.info(`Downloading Butler from ${downloadUrl}`);
    const response = await fetch(downloadUrl);
    if (!response.ok) {
      const { userMessage, meta } = formatErrorWithHints(
        new Error(`HTTP ${response.status} ${response.statusText}`),
        { op: "Download Butler", url: downloadUrl, filePath: zipPath, status: response.status },
      );
      logger.error("Butler download failed", meta);
      return { ok: false, error: userMessage };
    }

    const zipData = await response.arrayBuffer();
    try {
      fs.writeFileSync(zipPath, Buffer.from(zipData));
    } catch (e) {
      const { userMessage, meta } = formatErrorWithHints(e, {
        op: "Save Butler archive",
        url: downloadUrl ?? undefined,
        filePath: zipPath,
      });
      logger.error("Butler save failed", meta, e);
      return { ok: false, error: userMessage };
    }
    logger.info(`Butler zip saved to ${zipPath}`);

    logger.info(`Extracting Butler to ${butlerPath}...`);
    try {
      await extract(zipPath, { dir: butlerPath });
    } catch (e) {
      const { userMessage, meta } = formatErrorWithHints(e, {
        op: "Extract Butler",
        filePath: zipPath,
        dirPath: butlerPath,
      });
      logger.error("Butler extraction failed", meta, e);
      return { ok: false, error: userMessage };
    }
    logger.info("Butler extraction complete.");

    // make butler executable on unix
    if (process.platform !== "win32") {
      logger.info(`Setting executable bit for Butler at ${binPath}`);
      try {
        fs.chmodSync(binPath, 0o755);
      } catch (e) {
        const { userMessage, meta } = formatErrorWithHints(e, {
          op: "Set Butler executable bit",
          filePath: binPath,
        });
        logger.error("Butler chmod failed", meta, e);
        return { ok: false, error: userMessage };
      }
    }

    try {
      fs.unlinkSync(zipPath);
    } catch {
      // ignore
    }
    logger.info("Cleaned up Butler zip archve.");
  } catch (error) {
    const { userMessage, meta } = formatErrorWithHints(error, {
      op: "Install Butler",
      url: downloadUrl ?? undefined,
      filePath: zipPath,
      dirPath: butlerPath,
    });
    logger.error("Failed to install Butler", meta, error);
    return { ok: false, error: userMessage };
  }

  return { ok: true, path: binPath };
};
