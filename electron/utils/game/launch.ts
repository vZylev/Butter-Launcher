import { BrowserWindow } from "electron";
import { checkGameInstallation } from "./check";
import { join, dirname } from "path";
import { spawn } from "child_process";
import fs from "fs";
import { genUUID } from "./uuid";
import { installGame } from "./install";
import { logger } from "../logger";
import { getOnlinePatchState } from "./onlinePatch";
import { generateTokens } from "./tokens";

const ensureExecutable = (filePath: string) => {
  if (process.platform === "win32") return;
  try {
    const st = fs.statSync(filePath);
    // If user execute bit isn't set, try to fix it.
    if ((st.mode & 0o100) === 0) {
      fs.chmodSync(filePath, 0o755);
    }
  } catch {
    // ignore
  }
};

const isWaylandSession = (): boolean => {
  return (
    process.platform === "linux" &&
    (process.env.XDG_SESSION_TYPE === "wayland" ||
      process.env.WAYLAND_DISPLAY !== undefined ||
      process.env.DISPLAY === undefined)
  );
};

export const launchGame = async (
  baseDir: string,
  version: GameVersion,
  username: string,
  win: BrowserWindow,
  retryCount: number = 0,
  customUUID: string | null = null,
  callbacks?: {
    onGameSpawned?: () => void;
    onGameExited?: (info: {
      code: number | null;
      signal: NodeJS.Signals | null;
    }) => void;
  },
) => {
  if (retryCount > 1) {
    const msg = "Failed to launch game (max retries reached)";
    logger.error(msg);
    win.webContents.send("launch-error", msg);
    return;
  }

  logger.info(
    `Starting launch process for ${version.type} ${version.build_name} for user ${username}`,
  );

  let { client, server, jre } = checkGameInstallation(baseDir, version);
  if (!client || !server || !jre) {
    logger.info("Game components missing, starting installation:", {
      client,
      server,
      jre,
    });
    const installResult = await installGame(baseDir, version, win);
    if (!installResult) {
      const msg = "Game installation failed";
      logger.error(msg);
      win.webContents.send("launch-error", msg);
      return;
    }

    // Re-check after install.
    ({ client, server, jre } = checkGameInstallation(baseDir, version));
    if (!client || !server || !jre) {
      const msg = "Game installation incomplete (missing files after install)";
      logger.error(msg, { client, server, jre });
      win.webContents.send("launch-error", msg);
      return;
    }
    logger.info("Game installation successful and verified.");
  } else {
    logger.info("Game installation verified.");
  }

  const userDir = join(baseDir, "UserData");
  if (!fs.existsSync(userDir)) {
    logger.info(`Creating UserData directory at ${userDir}`);
    fs.mkdirSync(userDir, { recursive: true });
  }

  const normalizeUuid = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const compact = trimmed.replace(/-/g, "");
    if (/^[0-9a-fA-F]{32}$/.test(compact)) {
      const lower = compact.toLowerCase();
      return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20)}`;
    }

    if (
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
        trimmed,
      )
    ) {
      return trimmed.toLowerCase();
    }

    return null;
  };

  const uuidToUse = customUUID ? normalizeUuid(customUUID) : null;
  const finalUuid = uuidToUse ?? genUUID(username);

  logger.info(
    `Using UUID: ${finalUuid} (${customUUID ? "custom" : "generated"})`,
  );

  const args = [
    "--app-dir",
    join(dirname(client), ".."),
    "--user-dir",
    userDir,
    "--java-exec",
    jre,
    "--uuid",
    finalUuid,
    "--name",
    username,
  ];

  if (
    process.platform !== "win32" &&
    getOnlinePatchState(baseDir, version).enabled
  ) {
    logger.info(
      "Linux or macOS detected with online patch enabled, using auth tokens",
    );
    args.push("--auth-mode", "authenticated");

    const authTokens = generateTokens(username, finalUuid);
    if (!authTokens) {
      logger.error("Auth tokens not found, cannot launch game");
      win.webContents.send("launch-error", "Auth tokens not found");
      return;
    }
    args.push("--identity-token", authTokens.identityToken);
    args.push("--session-token", authTokens.sessionToken);
  } else {
    logger.info(
      "Windows detected or disabled online patch, using offline auth",
    );
    args.push("--auth-mode", "offline");
  }

  logger.info("Launch arguments:", args);

  const spawnClient = (attempt: number) => {
    logger.info(`Spawning client (attempt ${attempt + 1})...`);
    try {
      const env = { ...process.env };

      if (isWaylandSession()) {
        console.log(
          "Wayland session detected, setting SDL_VIDEODRIVER=wayland",
        );
        env.SDL_VIDEODRIVER = "wayland";
      }

      const child = spawn(client, args, {
        windowsHide: true,
        shell: false,
        cwd: dirname(client),
        // Critical for Windows: allow the launcher to quit without killing the game.
        // `stdio: "ignore"` + `unref()` prevents the child being tied to the parent lifetime.
        detached: process.platform !== "darwin",
        stdio: "ignore",
        env: env,
      });

      // Ensure the child is not keeping the parent process alive, and (on Windows)
      // is less likely to be terminated when the Electron app exits.
      child.unref();

      child.on("spawn", () => {
        logger.info("Game process spawned successfully.");
        callbacks?.onGameSpawned?.();
        win.webContents.send("launched");
      });

      child.on("error", (error: NodeJS.ErrnoException) => {
        // Common on Linux when the downloaded binary loses the executable bit.
        if (error?.code === "EACCES" && attempt === 0) {
          logger.warn(
            "Launch EACCES: attempting to chmod +x and retry",
            client,
          );
          ensureExecutable(client);
          spawnClient(1);
          return;
        }

        logger.error(`Error launching game: ${error.message}`, error);
        win.webContents.send("launch-error", error.message);
      });

      let finished = false;
      const onFinish = (code: number | null, signal: NodeJS.Signals | null) => {
        if (finished) return;
        finished = true;

        if (code && code !== 0) {
          logger.error(
            `Game exited with code ${code}${signal ? ` (signal ${signal})` : ""}`,
          );
        } else {
          logger.info(
            `Game exited smoothly (code ${code}${signal ? `, signal ${signal}` : ""})`,
          );
        }

        callbacks?.onGameExited?.({ code, signal });
        try {
          win.webContents.send("launch-finished", { code, signal });
        } catch {
          // Window/app may already be closing.
        }
      };

      // Prefer exit for detached children; keep close as a fallback.
      child.once("exit", onFinish);
      child.once("close", onFinish);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error launching game (catch): ${msg}`, error);
      win.webContents.send("launch-error", msg);
    }
  };

  // Best-effort: ensure executable bit before the first spawn.
  ensureExecutable(client);
  spawnClient(0);
};
