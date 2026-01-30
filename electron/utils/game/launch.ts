import { BrowserWindow } from "electron";
import crypto from "crypto";
import { checkGameInstallation } from "./check";
import { join, dirname } from "path";
import { spawn } from "child_process";
import fs from "fs";
import { genUUID } from "./uuid";
import { installGame } from "./install";
import { logger } from "../logger";
import { URL } from "url";

import { resolveExistingInstallDir } from "./paths";
import { getOnlinePatchState } from "./onlinePatch";
import type { GameVersion } from "./types";

// Default auth server URL - can be overridden by environment variable
const DEFAULT_AUTH_SERVER_URL = "https://auth.sanasol.ws";
const DEFAULT_AUTH_DOMAIN = "auth.sanasol.ws";

// Get auth server URL from environment or default
function getAuthServerUrl(authServerUrl?: string | null): string {
  return authServerUrl || process.env.HYTALE_AUTH_SERVER_URL || DEFAULT_AUTH_SERVER_URL;
}

// Get auth domain from environment or default
function getAuthDomain(authServerUrl?: string | null): string {
    if (authServerUrl) {
        try {
            return new URL(authServerUrl).hostname;
        } catch {
            return authServerUrl;
        }
    }
    return process.env.HYTALE_AUTH_DOMAIN || DEFAULT_AUTH_DOMAIN;
}

/**
 * Fetch properly signed JWT tokens from the auth server
 * This is required for the patched game to authenticate
 */
async function fetchAuthTokens(uuid: string, name: string, authServerUrl?: string | null): Promise<{
  identityToken: string;
  sessionToken: string;
}> {
  const url = `${getAuthServerUrl(authServerUrl)}/game-session/child`;

  logger.info(`[Launch] Fetching auth tokens from ${url}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uuid: uuid,
        name: name,
        scopes: ['hytale:server', 'hytale:client']
      })
    });

    if (!response.ok) {
      throw new Error(`Auth server returned ${response.status}`);
    }

    const data = await response.json();
    logger.info('[Launch] Auth tokens received from server');

    return {
      identityToken: data.IdentityToken || data.identityToken,
      sessionToken: data.SessionToken || data.sessionToken
    };
  } catch (error) {
    logger.error('[Launch] Failed to fetch auth tokens:', error);
    // Fallback to local token generation (won't pass signature validation but allows offline testing)
    return generateLocalTokens(uuid, name, authServerUrl);
  }
}

/**
 * Fallback: Generate tokens locally (won't pass signature validation but allows offline testing)
 */
function generateLocalTokens(uuid: string, name: string, authServerUrl?: string | null): {
  identityToken: string;
  sessionToken: string;
} {
  logger.info('[Launch] Using locally generated tokens (fallback mode)');
  const serverUrl = getAuthServerUrl(authServerUrl);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 36000; // 10 hours

  const header = Buffer.from(JSON.stringify({
    alg: 'EdDSA',
    kid: '2025-10-01',
    typ: 'JWT'
  })).toString('base64url');

  const identityPayload = Buffer.from(JSON.stringify({
    sub: uuid,
    name: name,
    username: name,
    entitlements: ['game.base'],
    scope: 'hytale:server hytale:client',
    iat: now,
    exp: exp,
    iss: serverUrl,
    jti: crypto.randomUUID()
  })).toString('base64url');

  const sessionPayload = Buffer.from(JSON.stringify({
    sub: uuid,
    scope: 'hytale:server',
    iat: now,
    exp: exp,
    iss: serverUrl,
    jti: crypto.randomUUID()
  })).toString('base64url');

  const signature = crypto.randomBytes(64).toString('base64url');

  return {
    identityToken: `${header}.${identityPayload}.${signature}`,
    sessionToken: `${header}.${sessionPayload}.${signature}`
  };
}

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
  authServerUrl: string | null = null,
  callbacks?: {
    onGameSpawned?: () => void;
    onGameExited?: (info: {
      code: number | null;
      signal: NodeJS.Signals | null;
    }) => void;
  },
) => {
  if (authServerUrl) {
    process.env.HYTALE_AUTH_SERVER_URL = authServerUrl;
    try {
        process.env.HYTALE_AUTH_DOMAIN = new URL(authServerUrl).hostname;
    } catch {
        process.env.HYTALE_AUTH_DOMAIN = authServerUrl;
    }
  }

  if (retryCount > 1) {
    const msg = "Failed to launch game (max retries reached)";
    logger.error(msg);
    win.webContents.send("launch-error", msg);
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
    const installResult = await installGame(baseDir, version, win);
    if (!installResult) {
      const msg = "Game installation failed";
      logger.error(msg);
      win.webContents.send("launch-error", msg);
      return;
    }

    // Re-check after install.
    ({ client, server, jre } = checkGameInstallation(baseDir, version));
    if (!client || !jre || (needsServer && !server)) {
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
    resolveExistingInstallDir(baseDir, version),
    "--user-dir",
    userDir,
    "--java-exec",
    jre,
    "--uuid",
    finalUuid,
    "--name",
    username,
  ];

  const patchState = getOnlinePatchState(baseDir, version, authServerUrl);
  const useAuthenticated = patchState.enabled;

  if (useAuthenticated) {
    logger.info(
      "Online patch enabled, using authenticated auth",
    );
    args.push("--auth-mode", "authenticated");

    try {
      const authTokens = await fetchAuthTokens(finalUuid, username, authServerUrl);
      args.push("--identity-token", authTokens.identityToken);
      args.push("--session-token", authTokens.sessionToken);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Authentication failed (unknown error)";
      logger.error("Authentication failed:", e);
      win.webContents.send("launch-error", msg);
      return;
    }
    // If this fails, it's not you. It's… probably DNS.
  } else {
    logger.info(
      "Online patch disabled, using offline auth",
    );
    args.push("--auth-mode", "offline");
  }

  logger.info("Launch arguments:", args);

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
        windowsHide: false,
        shell: false,
        cwd: dirname(client),
        // Critical for Windows: allow the launcher to quit without killing the game.
        // `stdio: "ignore"` + `unref()` prevents the child being tied to the parent lifetime.
        detached: process.platform !== "darwin",
        stdio: "pipe",
        env: env,
      });

      // Ensure the child is not keeping the parent process alive, and (on Windows)
      // is less likely to be terminated when the Electron app exits.
      child.unref();

      if (child.stdout) {
        child.stdout.on("data", (data) => {
          logger.info(`[Game] ${data.toString().trim()}`);
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (data) => {
          logger.error(`[Game Error] ${data.toString().trim()}`);
        });
      }

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
