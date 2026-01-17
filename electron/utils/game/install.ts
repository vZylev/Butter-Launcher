import { BrowserWindow } from "electron";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import stream from "stream";
import { spawn } from "child_process";
import extract from "extract-zip";
import { installButler } from "./butler";
import { installJRE } from "./jre";
import { checkGameInstallation } from "./check";

const pipeline = promisify(stream.pipeline);

const downloadPWR = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  const tempPWRPath = path.join(gameDir, `temp_${version.build_index}.pwr`);

  try {
    const response = await fetch(version.url);
    if (!response.ok)
      throw new Error(`Failed to download: ${response.statusText}`);
    if (!response.body) throw new Error("No response body");

    const contentLength = response.headers.get("content-length");
    const totalLength = contentLength ? parseInt(contentLength, 10) : 0;
    let downloadedLength = 0;

    const progressStream = new stream.PassThrough();
    progressStream.on("data", (chunk) => {
      downloadedLength += chunk.length;
      if (totalLength > 0) {
        const percentage = (downloadedLength / totalLength) * 100;
        win.webContents.send("install-progress", {
          phase: "pwr-download",
          percent: Math.round(percentage),
          total: totalLength,
          current: downloadedLength,
        });
      }
    });

    await pipeline(
      // @ts-ignore
      stream.Readable.fromWeb(response.body),
      progressStream,
      fs.createWriteStream(tempPWRPath),
    );

    win.webContents.send("install-progress", {
      phase: "pwr-download",
      percent: 100,
      total: totalLength,
      current: downloadedLength,
    });

    return tempPWRPath;
  } catch (error) {
    console.error("Failed to download PWR:", error);
    return null;
  }
};

const applyPWR = async (
  pwrPath: string,
  butlerPath: string,
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  const gameFinalDir = path.join(gameDir, "game", version.type);
  const stagingDir = path.join(gameFinalDir, "staging-temp");
  if (!fs.existsSync(gameFinalDir))
    fs.mkdirSync(gameFinalDir, { recursive: true });
  if (!fs.existsSync(stagingDir)) fs.mkdirSync(stagingDir, { recursive: true });

  win.webContents.send("install-progress", {
    phase: "patching",
    percent: -1,
  });

  return new Promise<string>((resolve, reject) => {
    const butlerProcess = spawn(butlerPath, [
      "apply",
      "--staging-dir",
      stagingDir,
      pwrPath,
      gameFinalDir,
    ]).on("error", (error) => {
      console.error("Butler process failed:", error);
      reject(error);
    });
    butlerProcess.stdout.on("data", (data) => {
      console.log(data.toString());
    });
    butlerProcess.stderr.on("data", (data) => {
      console.error(data.toString());
    });
    butlerProcess.on("close", (code) => {
      console.log(`Butler process exited with code ${code}`);
      resolve(gameFinalDir);
    });
  });
};

const applyFix = async (
  gameFinalDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  try {
    if (!version.hasFix || !version.fixURL) return;

    // download fix
    const fixPath = path.join(gameFinalDir, "fix.zip");

    const response = await fetch(version.fixURL);
    if (!response.ok)
      throw new Error(`Failed to download: ${response.statusText}`);
    if (!response.body) throw new Error("No response body");
    const contentLength = response.headers.get("content-length");
    const totalLength = contentLength ? parseInt(contentLength, 10) : 0;
    let downloadedLength = 0;

    const progressStream = new stream.PassThrough();
    progressStream.on("data", (chunk) => {
      downloadedLength += chunk.length;
      if (totalLength > 0) {
        const percentage = (downloadedLength / totalLength) * 80;
        win.webContents.send("install-progress", {
          phase: "fix-download",
          percent: Math.round(percentage),
          total: totalLength,
          current: downloadedLength,
        });
      }
    });

    await pipeline(
      // @ts-ignore
      stream.Readable.fromWeb(response.body),
      progressStream,
      fs.createWriteStream(fixPath),
    );

    win.webContents.send("install-progress", {
      phase: "fix-download",
      percent: 80,
      total: totalLength,
      current: downloadedLength,
    });

    // extract fix
    let extractedEntries = 0;

    await extract(fixPath, {
      dir: gameFinalDir,
      onEntry: (_, zipfile) => {
        extractedEntries++;
        const totalEntries = zipfile.entryCount;
        const percentage = 80 + (extractedEntries / totalEntries) * 20;
        win.webContents.send("install-progress", {
          phase: "fix-extract",
          percent: Math.round(percentage),
          total: totalEntries,
          current: extractedEntries,
        });
      },
    });

    return true;
  } catch (error) {
    console.error("Failed to apply fix:", error);
    return false;
  }
};

export const installGame = async (
  gameDir: string,
  version: GameVersion,
  win: BrowserWindow,
) => {
  try {
    const { client, server, jre } = checkGameInstallation(gameDir, version);

    fs.mkdirSync(gameDir, { recursive: true });
    win.webContents.send("install-started");

    if (!jre) {
      const jrePath = await installJRE(gameDir, win);
      if (!jrePath) return;
    }

    if (!client || !server) {
      const butlerPath = await installButler();
      if (!butlerPath) return;

      const tempPWRPath = await downloadPWR(gameDir, version, win);
      if (!tempPWRPath) return;

      const gameFinalDir = await applyPWR(
        tempPWRPath,
        butlerPath,
        gameDir,
        version,
        win,
      );
      console.log("PWR applied?", gameFinalDir);
      if (!gameFinalDir) throw new Error("Failed to apply PWR");
      console.log("PWR applied successfully");

      fs.unlinkSync(tempPWRPath);

      const applyFixResult = await applyFix(gameFinalDir, version, win);
      if (!applyFixResult) return;
    }
    console.log("Game installed successfully");

    win.webContents.send("install-finished", version);
    return true;
  } catch (error) {
    console.error("Installation failed:", error);
    win.webContents.send(
      "install-error",
      error instanceof Error ? error.message : "Unknown error",
    );
    return false;
  }
};
