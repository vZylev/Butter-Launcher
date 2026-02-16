import { BrowserWindow } from "electron";
import { checkGameInstallation } from "./check";
import { join, dirname } from "path";
import { spawn } from "child_process";
import fs from "fs";
import { genUUID } from "./uuid";
import { installGame, installGameNoPremiumFull } from "./install";
import { logger } from "../logger";
import { getOnlinePatchState } from "./onlinePatch";
import {
  fetchAuthTokens,
  fetchPremiumLaunchAuth,
  fetchPremiumLauncherPrimaryProfile,
} from "./auth";
import { resolveExistingInstallDir } from "./paths";
import { mapErrorToCode } from "../errorCodes";

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
  forceOfflineAuth: boolean = false,
  accountType: string | null = null,
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
    win.webContents.send("launch-error", { code: mapErrorToCode(msg, { area: "launch" }) });
    return;
  }

  logger.info(
    `Starting launch process for ${version.type} ${version.build_name} for user ${username}`,
  );

  const needsServer = process.platform !== "darwin";

  let { client, server, jre } = checkGameInstallation(baseDir, version);
  if (!client || !jre || (needsServer && !server)) {
    logger.info("Game components missing, starting installation:", {
      client,
      server,
      jre,
    });
    const isPremium = accountType === "premium";
    const installResult = isPremium
      ? await installGame(baseDir, version, win)
      : await installGameNoPremiumFull(baseDir, version, win);
    if (!installResult) {
      const msg = "Game installation failed";
      logger.error(msg);
      win.webContents.send("launch-error", { code: mapErrorToCode(msg, { area: "launch" }) });
      return;
    }

    // Re-check after install.
    ({ client, server, jre } = checkGameInstallation(baseDir, version));
    if (!client || !jre || (needsServer && !server)) {
      const msg = "Game installation incomplete (missing files after install)";
      logger.error(msg, { client, server, jre });
      win.webContents.send("launch-error", { code: mapErrorToCode(msg, { area: "launch" }) });
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
  let finalUuid = uuidToUse ?? genUUID(username);
  let finalUsername = username;

  if (accountType === "premium") {
    try {
      const p = await fetchPremiumLauncherPrimaryProfile();
      finalUsername = p.username;
      finalUuid = p.uuid;
    } catch (e) {
      logger.error("Premium get-launcher-data failed:", e);
      win.webContents.send("launch-error", { code: mapErrorToCode(e, { area: "auth" }) });
      return;
    }
  }

  logger.info(
    `Using UUID: ${finalUuid} (${accountType === "premium" ? "official" : customUUID ? "custom" : "generated"})`,
  );

  const args = [
    "--app-dir",
    resolveExistingInstallDir(baseDir, version),
    "--user-dir",
    userDir,
    "--java-exec",
    jre,
    "--uuid",
    finalUuid,
    "--name",
    finalUsername,
  ];

  const patchEnabled = getOnlinePatchState(baseDir, version).enabled;
  const hasProperPatchFlag = typeof version.proper_patch === "boolean";

  // New behavior:
  // - If online patch is enabled and proper_patch === false => authenticated + tokens
  // - If online patch is enabled and proper_patch === true  => offline
  // Compatibility fallback (when proper_patch is missing):
  // - Legacy behavior was Linux/macOS authenticated when patched.
  const useAuthenticated =
    accountType === "premium"
      ? !forceOfflineAuth
      : !forceOfflineAuth &&
        patchEnabled &&
        ((hasProperPatchFlag && version.proper_patch === false) ||
          (!hasProperPatchFlag && process.platform !== "win32"));
  // Nothing says "fun" like having two auth modes and three operating systems ;w;
  // And now a third input: "the internet is down". Perfect.

  if (useAuthenticated) {
    logger.info(
      "Online patch enabled with proper_patch=false (or legacy non-windows), using authenticated auth",
    );
    args.push("--auth-mode", "authenticated");

    try {
      if (accountType === "premium") {
        const r = await fetchPremiumLaunchAuth();
        // Ensure we launch with the official profile identity.
        finalUuid = r.uuid;
        finalUsername = r.username;

        // Keep args consistent if we overwrote after building args.
        const uuidIdx = args.indexOf("--uuid");
        if (uuidIdx !== -1 && args[uuidIdx + 1]) args[uuidIdx + 1] = finalUuid;
        const nameIdx = args.indexOf("--name");
        if (nameIdx !== -1 && args[nameIdx + 1]) args[nameIdx + 1] = finalUsername;

        args.push("--identity-token", r.identityToken);
        args.push("--session-token", r.sessionToken);
      } else {
        const authTokens = await fetchAuthTokens(username, finalUuid);
        args.push("--identity-token", authTokens.identityToken);
        args.push("--session-token", authTokens.sessionToken);
      }
    } catch (e) {
      logger.error("Authentication failed:", e);
      win.webContents.send("launch-error", { code: mapErrorToCode(e, { area: "auth" }) });
      return;
    }
    // If this fails, it's not you. It's… probably DNS.
  } else {
    logger.info(
      forceOfflineAuth
        ? "Launcher offline mode requested, using offline auth"
        : patchEnabled
          ? "Online patch enabled with proper_patch=true, using offline auth"
          : "Online patch disabled, using offline auth",
    );
    // Offline auth: because sometimes DNS has other plans.
    args.push("--auth-mode", "offline");
  }

  logger.info("Launch arguments:", args);

  const appDir = resolveExistingInstallDir(baseDir, version);

  const spawnClient = (attempt: number) => {
    logger.info(`Spawning client (attempt ${attempt + 1})...`);
    try {
      const env = { ...process.env };

      // Linux specific environment variables
      if (process.platform === "linux") {
        env.LD_LIBRARY_PATH = dirname(client);

        if (isWaylandSession()) {
          console.log(
            "Wayland session detected, setting SDL_VIDEODRIVER=wayland",
          );
          env.SDL_VIDEODRIVER = "wayland";
        }
      }

      const child = spawn(client, args, {
        windowsHide: true,
        shell: false,
        // Many builds assume relative paths resolve from the build root.
        // Using Client/ as cwd can cause "launch then instant exit" on some versions.
        cwd: appDir,
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
        win.webContents.send("launch-error", { code: mapErrorToCode(error, { area: "launch" }) });
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
      win.webContents.send("launch-error", { code: mapErrorToCode(error, { area: "launch" }) });
    }
  };

  // Best-effort: ensure executable bit before the first spawn.
  ensureExecutable(client);
  spawnClient(0);
};
