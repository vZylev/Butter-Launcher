import { BrowserWindow } from "electron";
import { checkGameInstallation } from "./check";
import { join, dirname } from "path";
import { exec } from "child_process";
import fs from "fs";
import { genUUID } from "./uuid";
import { installGame } from "./install";

export const launchGame = async (
  baseDir: string,
  version: GameVersion,
  username: string,
  win: BrowserWindow,
  retryCount: number = 0
) => {
  if (retryCount > 1) {
    console.error("Failed to launch game, maximum retry count reached");
    return;
  }

  let { client, server, jre } = checkGameInstallation(baseDir, version);
  if (!client || !server || !jre) {
    console.log("Game not installed, missing:", { client, server, jre });
    const installResult = await installGame(baseDir, version, win);
    if (!installResult) {
      console.error("Game installation failed, retrying...");
      launchGame(baseDir, version, username, win, retryCount + 1);
    } else {
      launchGame(baseDir, version, username, win);
    }
    return;
  }

  const userDir = join(baseDir, "UserData");
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir);

  const args = [
    "--app-dir",
    join(dirname(client), ".."),
    "--user-dir",
    userDir,
    "--java-exec",
    jre,
    "--auth-mode offline",
    "--uuid",
    genUUID(username),
    "--name",
    username,
  ];

  win.webContents.send("launched");
  exec(`"${client}" ${args.join(" ")}`, (error) => {
    if (error) {
      console.error(`Error launching game: ${error.message}`);
      win.webContents.send("launch-error");
      return;
    }
    win.webContents.send("launch-finished");
  });
};
