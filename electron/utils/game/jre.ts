import { BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import stream from "node:stream";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import extract from "extract-zip";
import * as tar from "tar";

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

export const installJRE = async (gameDir: string, win: BrowserWindow) => {
  const os = process.platform;

  try {
    const response = await fetch(JRE_URL);
    if (!response.ok) throw new Error("Failed to fetch JRE");
    const jre: JRE = await response.json();

    let downloadUrl: string | null = null;
    let downloadHash: string | null = null;
    let jreCompressedPath: string | null = null;

    if (os === "win32") {
      jreCompressedPath = path.join(
        gameDir,
        jre.download_url.windows.amd64.url.split("/").pop()!
      );

      downloadUrl = jre.download_url.windows.amd64.url;
      downloadHash = jre.download_url.windows.amd64.sha256;
    } else if (os === "linux") {
      jreCompressedPath = path.join(
        gameDir,
        jre.download_url.linux.amd64.url.split("/").pop()!
      );

      downloadUrl = jre.download_url.linux.amd64.url;
      downloadHash = jre.download_url.linux.amd64.sha256;
    } else if (os === "darwin") {
      jreCompressedPath = path.join(
        gameDir,
        jre.download_url.darwin.arm64.url.split("/").pop()!
      );

      downloadUrl = jre.download_url.darwin.arm64.url;
      downloadHash = jre.download_url.darwin.arm64.sha256;
    }

    if (!downloadUrl || !downloadHash || !jreCompressedPath)
      throw new Error("Failed to find JRE");

    if (fs.existsSync(jreCompressedPath)) {
      const verifyResult = await verifyJRE(jreCompressedPath, downloadHash);
      if (verifyResult) {
        // JRE is already downloaded and verified
        const extractResult = await extractJRE(jreCompressedPath, gameDir, win);
        if (!extractResult) throw new Error("Failed to extract JRE");

        return extractResult;
      }
    }

    const resFile = await fetch(downloadUrl);
    if (!resFile.ok) throw new Error("Failed to download JRE");
    const contentLength = resFile.headers.get("content-length");
    const totalLength = contentLength ? parseInt(contentLength, 10) : 0;
    let downloadedLength = 0;

    const progressStream = new stream.PassThrough();
    progressStream.on("data", (chunk) => {
      downloadedLength += chunk.length;
      if (totalLength > 0) {
        const percentage =
          (downloadedLength / totalLength) * (os === "win32" ? 80 : 100);
        win.webContents.send("install-progress", {
          phase: "jre-download",
          percent: Math.round(percentage),
          total: totalLength,
          current: downloadedLength,
        });
      }
    });

    await pipeline(
      // @ts-ignore
      stream.Readable.fromWeb(resFile.body),
      progressStream,
      fs.createWriteStream(jreCompressedPath)
    );

    win.webContents.send("install-progress", {
      phase: "jre-download",
      percent: 100,
      total: totalLength,
      current: downloadedLength,
    });

    const verifyResult = await verifyJRE(jreCompressedPath, downloadHash);
    if (!verifyResult) throw new Error("JRE hash mismatch");

    const extractResult = await extractJRE(jreCompressedPath, gameDir, win);
    if (!extractResult) throw new Error("Failed to extract JRE");

    return extractResult;
  } catch (error) {
    console.error("Failed to install JRE:", error);
    return null;
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
  win: BrowserWindow
) => {
  try {
    const jreDir = path.join(gameDir, "jre");
    if (fs.existsSync(jreDir))
      fs.rmSync(jreDir, { recursive: true, force: true });
    fs.mkdirSync(jreDir, { recursive: true });

    if (jreCompressedPath.endsWith(".tar.gz")) {
      win.webContents.send("install-progress", {
        phase: "jre-extract",
        percent: -1,
      });

      await tar.x({
        file: jreCompressedPath,
        cwd: jreDir,
        strip: 1,
      });
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

      // move files from subdirectory to root
      const files = fs.readdirSync(jreDir);
      const subDir = files.find(
        (f) =>
          !f.startsWith(".") && fs.statSync(path.join(jreDir, f)).isDirectory()
      );

      if (subDir) {
        const subDirPath = path.join(jreDir, subDir);
        const subFiles = fs.readdirSync(subDirPath);
        for (const file of subFiles) {
          fs.renameSync(path.join(subDirPath, file), path.join(jreDir, file));
        }
        // remove subdirectory
        fs.rmSync(subDirPath, { recursive: true });
      }
    }

    const jrePath = path.join(jreDir, "bin", "java");
    if (!fs.existsSync(jrePath)) throw new Error("Failed to extract JRE");

    fs.unlinkSync(jreCompressedPath);

    return jrePath;
  } catch (error) {
    console.error("Failed to extract JRE:", error);
    return null;
  }
};
